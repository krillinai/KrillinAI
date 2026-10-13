const RUNTIME_PREFIX = '/.opencreator/runtime';
const CREATOR_SOURCE_UPLOAD_CONTENT_TYPE =
  'application/vnd.opencreator.creator-source';
const CREATOR_SOURCE_UPLOAD_PATH =
  /^\/creator\/jobs\/creator_job_[A-Za-z0-9_-]+\/source-video$/;

export const MAX_RUNTIME_REQUEST_BODY_BYTES = 10 * 1024 * 1024;

export type RuntimeProxyErrorDetail = {
  name?: string;
  code?: string;
  errno?: number;
  syscall?: string;
};

export function runtimeProxyErrorDetails(error: unknown): RuntimeProxyErrorDetail[] {
  const details: RuntimeProxyErrorDetail[] = [];
  const pending: Array<{ value: unknown; depth: number }> = [{ value: error, depth: 0 }];
  const seen = new Set<object>();

  while (pending.length > 0 && details.length < 8) {
    const { value, depth } = pending.shift()!;
    if (typeof value !== 'object' || value === null || seen.has(value)) continue;
    seen.add(value);
    try {
      const entry = value as Record<string, unknown>;
      const name = entry.name;
      const code = entry.code;
      const errno = entry.errno;
      const syscall = entry.syscall;
      const detail: RuntimeProxyErrorDetail = {};
      if (typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) {
        detail.name = name;
      }
      if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) {
        detail.code = code;
      }
      if (typeof errno === 'number' && Number.isSafeInteger(errno)) {
        detail.errno = errno;
      }
      if (typeof syscall === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(syscall)) {
        detail.syscall = syscall;
      }
      details.push(detail);

      if (depth >= 3) continue;
      pending.push({ value: entry.cause, depth: depth + 1 });
      const errors = entry.errors;
      if (Array.isArray(errors)) {
        for (let index = 0; index < Math.min(errors.length, 8); index += 1) {
          pending.push({ value: errors[index], depth: depth + 1 });
        }
      }
    } catch {
      // Diagnostic extraction must not replace the original proxy failure.
    }
  }

  return details;
}

export class RuntimeProxyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RuntimeProxyError';
  }
}

export function isRuntimeRequestUrl(url: URL): boolean {
  return url.hostname === 'app'
    && (
      url.pathname === RUNTIME_PREFIX
      || url.pathname.startsWith(`${RUNTIME_PREFIX}/`)
    );
}

export function createRuntimeProxyTarget(
  requestUrl: URL,
  daemonAddress: string
): URL {
  if (!isRuntimeRequestUrl(requestUrl)) {
    throw new RuntimeProxyError(404, 'RUNTIME_ROUTE_INVALID', 'Runtime route is invalid');
  }
  const daemon = parseDaemonOrigin(daemonAddress);
  const runtimePath = requestUrl.pathname.slice(RUNTIME_PREFIX.length) || '/';
  validateRuntimePath(runtimePath);
  const target = new URL(`${runtimePath}${requestUrl.search}`, `${daemon.origin}/`);
  if (target.origin !== daemon.origin) {
    throw new RuntimeProxyError(400, 'RUNTIME_TARGET_INVALID', 'Runtime target must remain same-origin');
  }
  return target;
}

export async function readBoundedRequestBody(
  request: Pick<Request, 'headers' | 'body'>,
  limit = MAX_RUNTIME_REQUEST_BODY_BYTES
): Promise<ArrayBuffer | undefined> {
  const declaredLength = request.headers.get('content-length');
  if (/^\d+$/.test(declaredLength ?? '') && Number(declaredLength) > limit) {
    throw payloadTooLarge();
  }
  if (request.body === null) return undefined;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

export function createRuntimeProxyHeaders(
  requestHeaders: Headers,
  token: string
): Headers {
  const headers = new Headers(requestHeaders);
  for (const name of [
    'authorization',
    'host',
    'origin',
    'referer',
    'connection'
  ]) {
    headers.delete(name);
  }
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

export function isStreamingRuntimeUploadRequest(
  target: Pick<URL, 'pathname'>,
  request: Pick<Request, 'method' | 'headers'>
): boolean {
  const contentType = request.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  return request.method.toUpperCase() === 'POST'
    && CREATOR_SOURCE_UPLOAD_PATH.test(target.pathname)
    && contentType === CREATOR_SOURCE_UPLOAD_CONTENT_TYPE;
}

function parseDaemonOrigin(address: string): URL {
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(address);
  const port = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new RuntimeProxyError(
      502,
      'RUNTIME_CONNECTION_INVALID',
      'Runtime connection must use an explicit loopback HTTP origin'
    );
  }
  return new URL(address);
}

function validateRuntimePath(path: string): void {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw invalidPath();
  }
  for (const candidate of [path, decoded]) {
    if (
      candidate.startsWith('//')
      || candidate.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(candidate)
    ) {
      throw invalidPath();
    }
  }
}

function invalidPath(): RuntimeProxyError {
  return new RuntimeProxyError(
    400,
    'RUNTIME_PATH_INVALID',
    'Runtime path is invalid'
  );
}

function payloadTooLarge(): RuntimeProxyError {
  return new RuntimeProxyError(
    413,
    'RUNTIME_PAYLOAD_TOO_LARGE',
    'Runtime request body exceeds the 10 MiB limit'
  );
}
