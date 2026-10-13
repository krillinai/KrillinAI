import { isRecord } from './upstream-fetch.js';
import sharp from 'sharp';

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

export type MuseTaskState = {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  url?: string;
  base64?: string;
  mime?: string;
  error?: string;
};

export class Muse2ApiError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = 'Muse2ApiError';
  }
}

export async function pollMuseTaskUntilTerminal(
  poll: () => Promise<MuseTaskState>,
  signal: AbortSignal,
  intervalMs = 2_500
): Promise<MuseTaskState> {
  let consecutiveFailures = 0;
  while (true) {
    signal.throwIfAborted();
    try {
      const state = await poll();
      consecutiveFailures = 0;
      if (state.status === 'completed' || state.status === 'failed') return state;
    } catch (error) {
      if (signal.aborted || ++consecutiveFailures >= 4) throw error;
    }
    await delay(intervalMs, signal);
  }
}

export function createMuse2ApiClient(input: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}) {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const fetchImpl = input.fetchImpl ?? fetch;

  async function requestJson(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: unknown; signal: AbortSignal; idempotencyKey?: string }
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: 'application/json'
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await fetchImpl(endpoint(baseUrl, path), {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: options.signal,
      redirect: 'manual'
    });
    rejectRedirect(response);
    const payload = await readJson(response, MAX_JSON_BYTES);
    if (!response.ok) {
      const rawMessage = errorMessage(payload, response.status);
      const message = input.apiKey ? rawMessage.replaceAll(input.apiKey, '[redacted]') : rawMessage;
      throw new Muse2ApiError(message, response.status);
    }
    if (!isRecord(payload)) throw new Muse2ApiError('Muse2API returned an invalid response');
    return payload;
  }

  return {
    async chat(
      messages: Array<{ role: string; content: string }>,
      model: string,
      signal: AbortSignal
    ): Promise<string> {
      const payload = await requestJson('chat/completions', {
        method: 'POST',
        body: { model, messages, stream: false },
        signal
      });
      const choices = payload.choices;
      const first = Array.isArray(choices) && isRecord(choices[0]) ? choices[0] : undefined;
      const message = first !== undefined && isRecord(first.message) ? first.message : undefined;
      if (typeof message?.content !== 'string') {
        throw new Muse2ApiError('Muse Spark returned no plain-text answer');
      }
      return message.content;
    },

    async submitImage(request: {
      prompt: string;
      model: string;
      aspectRatio: string;
      referenceImage?: string;
      operationId: string;
      signal: AbortSignal;
    }): Promise<string> {
      const payload = await requestJson('images/tasks', {
        method: 'POST',
        idempotencyKey: request.operationId,
        body: {
          prompt: request.prompt,
          model: request.model,
          size: request.aspectRatio,
          n: 1,
          response_format: 'url',
          async: true,
          ...(request.referenceImage === undefined ? {} : { reference_image: request.referenceImage })
        },
        signal: request.signal
      });
      return readRemoteId(payload);
    },

    async pollImage(taskId: string, signal: AbortSignal): Promise<MuseTaskState> {
      const payload = await requestJson(`images/tasks/${encodeURIComponent(taskId)}`, { signal });
      return normalizeTask(payload, 'image');
    },

    async submitVideo(request: {
      prompt: string;
      model: string;
      duration: number;
      aspectRatio: string;
      referenceImage?: string;
      signal: AbortSignal;
    }): Promise<string> {
      const payload = await requestJson('videos', {
        method: 'POST',
        body: {
          prompt: request.prompt,
          model: request.model,
          duration: request.duration,
          size: request.aspectRatio,
          ...(request.referenceImage === undefined ? {} : { reference_image: request.referenceImage })
        },
        signal: request.signal
      });
      return readRemoteId(payload);
    },

    async pollVideo(taskId: string, signal: AbortSignal): Promise<MuseTaskState> {
      const payload = await requestJson(`videos/${encodeURIComponent(taskId)}`, { signal });
      return normalizeTask(payload, 'video');
    },

    async downloadMedia(
      mediaUrl: string,
      kind: 'image' | 'video',
      signal: AbortSignal
    ): Promise<{ content: Buffer; mime: string }> {
      let url: URL;
      try {
        url = new URL(mediaUrl, baseUrl);
      } catch {
        throw new Muse2ApiError('Muse2API returned an invalid media URL');
      }
      if (
        url.origin !== baseUrl.origin
        || url.protocol !== baseUrl.protocol
        || url.username
        || url.password
      ) {
        throw new Muse2ApiError('Muse2API media URL must use the configured gateway origin');
      }
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: kind === 'image' ? 'image/*' : 'video/mp4' },
        signal,
        redirect: 'manual'
      });
      rejectRedirect(response);
      if (!response.ok) throw new Muse2ApiError(`Muse2API media download failed with status ${response.status}`, response.status);
      const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw new Muse2ApiError('Muse2API returned a media file that is too large');
      }
      const content = await readBytesLimited(response, maxBytes);
      if (content.length === 0 || content.length > maxBytes) {
        throw new Muse2ApiError('Muse2API returned an invalid media file');
      }
      const mime = normalizeContentType(response.headers.get('content-type'))
        || (kind === 'video' ? 'video/mp4' : undefined);
      if (kind === 'video' && (mime === undefined || !mime.startsWith('video/'))) {
        throw new Muse2ApiError('Muse2API returned a non-video media response');
      }
      if (kind === 'image') {
        const imageMime = await validateMuseImageContent(content, mime);
        return { content, mime: imageMime };
      }
      return { content, mime: mime! };
    }
  };
}

/** Validates both the container signature and a full decode before accepting provider image bytes. */
export async function validateMuseImageContent(
  content: Buffer,
  header?: string
): Promise<'image/png' | 'image/jpeg' | 'image/webp'> {
  if (content.length < 16 || content.length > MAX_IMAGE_BYTES) {
    throw new Muse2ApiError('Muse2API returned an invalid image file');
  }
  let signature: 'image/png' | 'image/jpeg' | 'image/webp' | undefined;
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    signature = 'image/png';
  } else if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    signature = 'image/jpeg';
  } else if (content.subarray(0, 4).toString('ascii') === 'RIFF'
    && content.subarray(8, 12).toString('ascii') === 'WEBP') {
    if (content.readUInt32LE(4) + 8 !== content.length) {
      throw new Muse2ApiError('Muse2API returned a truncated or invalid WebP file');
    }
    signature = 'image/webp';
  }
  if (signature === undefined) throw new Muse2ApiError('Muse2API returned an unsupported image file');

  const contentType = normalizeContentType(header ?? null);
  const headerMime = contentType === 'application/octet-stream' || contentType === undefined
    ? undefined
    : contentType === 'image/jpg' ? 'image/jpeg' : contentType;
  if (headerMime !== undefined && headerMime !== signature) {
    throw new Muse2ApiError('Muse2API image signature does not match its Content-Type');
  }
  if (headerMime !== undefined && !['image/png', 'image/jpeg', 'image/webp'].includes(headerMime)) {
    throw new Muse2ApiError('Muse2API returned an unsupported image Content-Type');
  }

  try {
    const options = { failOn: 'error' as const, limitInputPixels: 100_000_000 };
    const metadata = await sharp(content, options).metadata();
    if (metadata.format !== signature.slice('image/'.length)) {
      throw new Error('image container mismatch');
    }
    // Metadata can be read from a truncated file. stats forces decoding of its image data.
    await sharp(content, options).stats();
  } catch {
    throw new Muse2ApiError('Muse2API returned a truncated or invalid image file');
  }
  return signature;
}

async function readBytesLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (reader === undefined) return Buffer.from(await response.arrayBuffer());
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Muse2ApiError('Muse2API returned a media file that is too large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

function normalizeContentType(value: string | null): string | undefined {
  return value?.split(';')[0]?.trim().toLowerCase() || undefined;
}

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Muse2ApiError('Muse2API base URL is invalid');
  }
  if (
    !['http:', 'https:'].includes(url.protocol)
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Muse2ApiError('Muse2API base URL must be HTTP(S) without credentials, query, or fragment');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function endpoint(base: URL, path: string): URL {
  return new URL(path.replace(/^\/+/, ''), base);
}

function rejectRedirect(response: Response): void {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Muse2ApiError('Muse2API redirects are not followed');
  }
}

async function readJson(response: Response, maxBytes: number): Promise<unknown> {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Muse2ApiError('Muse2API response is too large');
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Muse2ApiError('Muse2API returned invalid JSON', response.status);
  }
}

function readRemoteId(payload: Record<string, unknown>): string {
  const value = payload.id ?? payload.task_id;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw new Muse2ApiError('Muse2API accepted the request but returned no usable task id');
  }
  return value;
}

function normalizeTask(payload: Record<string, unknown>, kind: 'image' | 'video'): MuseTaskState {
  const status = normalizeStatus(payload.status);
  const rawProgress = payload.progress;
  const progress = typeof rawProgress === 'number' && Number.isFinite(rawProgress)
    ? Math.max(0, Math.min(99, Math.round(rawProgress)))
    : undefined;
  const result = isRecord(payload.result) ? payload.result : {};
  const data = Array.isArray(payload.data) && isRecord(payload.data[0]) ? payload.data[0] : {};
  const video = isRecord(payload.video) ? payload.video : {};
  const url = firstString(
    payload.url,
    result.url,
    result.video_url,
    result.videoUrl,
    data.url,
    kind === 'video' ? video.url : undefined
  );
  const base64 = kind === 'image'
    ? firstString(data.b64_json, result.b64_json, payload.b64_json)
    : undefined;
  const error = firstString(payload.error, payload.message);
  return {
    status,
    ...(progress === undefined ? {} : { progress }),
    ...(url === undefined ? {} : { url }),
    ...(base64 === undefined ? {} : { base64 }),
    ...(error === undefined ? {} : { error }),
    ...(typeof data.mime_type === 'string' ? { mime: data.mime_type } : {})
  };
}

function normalizeStatus(value: unknown): MuseTaskState['status'] {
  if (value === 'completed' || value === 'succeeded' || value === 'success' || value === 'done') return 'completed';
  if (value === 'failed' || value === 'error' || value === 'cancelled' || value === 'canceled') return 'failed';
  if (value === 'processing' || value === 'running' || value === 'in_progress') return 'processing';
  return 'queued';
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function errorMessage(payload: unknown, status: number): string {
  if (!isRecord(payload)) return `Muse2API request failed with status ${status}`;
  const error = isRecord(payload.error) ? payload.error : {};
  const message = firstString(error.message, payload.message, payload.detail);
  return message === undefined
    ? `Muse2API request failed with status ${status}`
    : `Muse2API request failed with status ${status}: ${message.slice(0, 500)}`;
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}
