import type {
  ImageGenerationAsset,
  ImageGenerationQuality,
  ImageGenerationSize
} from '@opencreator/protocol';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  createCodexAppServerHost,
  type CodexAppServerHost,
  type CodexAppServerHostInput,
  type CodexAppServerResult,
  type CodexAppServerTurnInput
} from '../codex/app-server-host-2026-07-28.js';

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

type ImageGenerationItem = {
  type: 'imageGeneration';
  status?: unknown;
  failure?: unknown;
  savedPath?: unknown;
};

type LocalArtifactMetadata = {
  mtimeMs: number;
  size: number;
};

type LocalArtifactSnapshot = Map<string, LocalArtifactMetadata>;

type LocalArtifactScanRoot = {
  path: string;
  boundary: string;
  recursive: boolean;
};

export type CodexNativeImageInput = {
  prompt: string;
  size: ImageGenerationSize;
  quality: ImageGenerationQuality;
  cwd: string;
  codexBin: string;
  codexHome: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  createHost?: (input: CodexAppServerHostInput) => CodexAppServerHost;
};

export type CodexNativeImageResult = {
  content: Buffer;
  mime: ImageGenerationAsset['mime'];
  model: 'codex-native';
};

export class CodexNativeImageError extends Error {
  constructor(
    readonly code: 'config_missing' | 'upstream_error',
    message: string
  ) {
    super(message);
    this.name = 'CodexNativeImageError';
  }
}

export async function generateCodexNativeImage(
  input: CodexNativeImageInput
): Promise<CodexNativeImageResult> {
  await assertLocalConfiguration(input);
  if (input.signal?.aborted) {
    throw new CodexNativeImageError('upstream_error', 'Codex native image generation was canceled');
  }

  const createHost = input.createHost ?? createCodexAppServerHost;
  const host = createHost({
    codexBin: input.codexBin,
    codexHome: input.codexHome,
    cwd: input.cwd,
    profile: 'default'
  });
  let imageItem: ImageGenerationItem | undefined;
  let codexThreadId: string | undefined;
  try {
    await host.started;
    const artifactSnapshot = await snapshotLocalArtifacts(input);
    const generationStartedAt = Date.now();
    const process = host.run({
      cwd: input.cwd,
      sandbox: 'workspace-write',
      prompt: buildImagePrompt(input),
      developerInstructions: [
        'Use the native image_generation tool for exactly one original image.',
        'Do not call an external image API, use an API key, or return a remote URL.',
        'The completed image must be saved as the imageGeneration savedPath artifact.'
      ].join(' '),
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      inactivityTimeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      onThreadStarted(threadId) {
        codexThreadId = threadId;
      },
      onNotification(notification) {
        const candidate = readCompletedImageItem(notification);
        if (candidate !== undefined) imageItem = candidate;
      }
    });
    const result = await awaitProcessResult(
      process,
      input.signal,
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    if (result.turnStatus !== 'completed') {
      throw new CodexNativeImageError(
        'upstream_error',
        `Codex native image turn ended with status ${result.turnStatus}`
      );
    }
    return {
      ...(await readImageArtifact(
        imageItem,
        input,
        artifactSnapshot,
        generationStartedAt,
        codexThreadId
      )),
      model: 'codex-native'
    };
  } catch (error) {
    if (error instanceof CodexNativeImageError) throw error;
    throw new CodexNativeImageError(
      'upstream_error',
      error instanceof Error ? error.message : 'Codex native image generation failed'
    );
  } finally {
    await host.close('codex-native-image-finished').catch(() => undefined);
  }
}

async function assertLocalConfiguration(input: CodexNativeImageInput): Promise<void> {
  if (!input.codexBin.trim() || !isAbsolute(input.cwd) || !isAbsolute(input.codexHome)) {
    throw new CodexNativeImageError(
      'config_missing',
      'Codex native image generation requires an executable, absolute workspace, and CODEX_HOME'
    );
  }
  const [workspace, codexHome] = await Promise.all([
    stat(input.cwd).catch(() => undefined),
    stat(input.codexHome).catch(() => undefined)
  ]);
  if (!workspace?.isDirectory() || !codexHome?.isDirectory()) {
    throw new CodexNativeImageError(
      'config_missing',
      'Codex native image generation requires an existing workspace and CODEX_HOME directory'
    );
  }
  if (isCodexExecutablePath(input.codexBin)) {
    const executablePath = isAbsolute(input.codexBin)
      ? input.codexBin
      : resolve(input.cwd, input.codexBin);
    const executable = await stat(executablePath).catch(() => undefined);
    if (!executable?.isFile()) {
      throw new CodexNativeImageError(
        'config_missing',
        `Codex executable was not found at ${executablePath}`
      );
    }
  }
}

function isCodexExecutablePath(codexBin: string): boolean {
  return isAbsolute(codexBin) || /[\\/]/.test(codexBin);
}

function buildImagePrompt(input: Pick<CodexNativeImageInput, 'prompt' | 'size' | 'quality'>): string {
  return [
    'Generate one original image for OpenCreator.',
    `Requested canvas: ${input.size}. Requested quality: ${input.quality}.`,
    `User image brief: ${input.prompt.trim()}`
  ].join('\n');
}

function readCompletedImageItem(
  notification: Record<string, unknown>
): ImageGenerationItem | undefined {
  if (notification.method !== 'item/completed') return undefined;
  const params = asRecord(notification.params);
  const item = asRecord(params?.item);
  if (item?.type !== 'imageGeneration') return undefined;
  return item as ImageGenerationItem;
}

async function readImageArtifact(
  item: ImageGenerationItem | undefined,
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>,
  artifactSnapshot: LocalArtifactSnapshot,
  generationStartedAt: number,
  codexThreadId: string | undefined
): Promise<Pick<CodexNativeImageResult, 'content' | 'mime'>> {
  const failure = asRecord(item?.failure);
  if (failure !== undefined) {
    throw new CodexNativeImageError(
      'upstream_error',
      `Codex native image generation failed: ${stringField(failure, 'message') ?? 'unknown failure'}`
    );
  }
  if (item?.status === 'failed') {
    throw new CodexNativeImageError('upstream_error', 'Codex native image generation failed');
  }

  if (
    item !== undefined
    && Object.prototype.hasOwnProperty.call(item, 'savedPath')
    && item.savedPath !== undefined
  ) {
    if (typeof item.savedPath !== 'string' || !item.savedPath.trim() || !isAbsolute(item.savedPath)) {
      throw new CodexNativeImageError(
        'upstream_error',
        'Codex imageGeneration returned no valid absolute savedPath'
      );
    }
    return await readImageArtifactAtPath(item.savedPath, input);
  }

  const discovered = await discoverNewLocalArtifact(
    input,
    artifactSnapshot,
    generationStartedAt,
    codexThreadId
  );
  if (discovered === undefined) {
    throw new CodexNativeImageError(
      'upstream_error',
      'Codex completed without a new local image artifact'
    );
  }
  return discovered;
}

async function readImageArtifactAtPath(
  savedPath: string,
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>
): Promise<Pick<CodexNativeImageResult, 'content' | 'mime'>> {
  if (savedPath.startsWith('file:') || savedPath.includes('\0')) {
    throw new CodexNativeImageError('upstream_error', 'Codex image savedPath is not a local filesystem path');
  }

  const candidate = resolve(savedPath);
  const roots = await allowedRoots(input);
  let artifactPath: string;
  try {
    artifactPath = await realpath(candidate);
    const rootPaths = await Promise.all(roots.map(async root => (
      await realpath(root).catch(() => root)
    )));
    if (!rootPaths.some(root => isPathInside(root, artifactPath))) {
      throw new Error('outside allowed roots');
    }
    const metadata = await stat(artifactPath);
    if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) {
      throw new Error('invalid image file size');
    }
  } catch {
    throw new CodexNativeImageError(
      'upstream_error',
      'Codex image artifact is missing or outside the allowed local roots'
    );
  }

  const content = await readFile(artifactPath);
  if (content.length > MAX_IMAGE_BYTES) {
    throw new CodexNativeImageError(
      'upstream_error',
      'Codex image artifact exceeds the local size limit'
    );
  }
  const mime = detectImageMime(content);
  if (mime === undefined) {
    throw new CodexNativeImageError(
      'upstream_error',
      'Codex image artifact has an unsupported or invalid image signature'
    );
  }
  return { content, mime };
}

async function snapshotLocalArtifacts(
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>
): Promise<LocalArtifactSnapshot> {
  const snapshot: LocalArtifactSnapshot = new Map();
  for (const path of await listLocalArtifactFiles(discoveryRoots(input))) {
    const metadata = await stat(path).catch(() => undefined);
    if (metadata?.isFile()) {
      snapshot.set(path, { mtimeMs: metadata.mtimeMs, size: metadata.size });
    }
  }
  return snapshot;
}

async function discoverNewLocalArtifact(
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>,
  snapshot: LocalArtifactSnapshot,
  generationStartedAt: number,
  codexThreadId: string | undefined
): Promise<Pick<CodexNativeImageResult, 'content' | 'mime'> | undefined> {
  const candidates: Array<Pick<CodexNativeImageResult, 'content' | 'mime'>> = [];
  for (const path of await listLocalArtifactFiles(discoveryRoots(input, codexThreadId))) {
    const metadata = await stat(path).catch(() => undefined);
    if (metadata === undefined || !metadata.isFile()) continue;
    const previous = snapshot.get(path);
    const isNewPath = previous === undefined;
    const isChangedPath = previous !== undefined
      && (previous.mtimeMs !== metadata.mtimeMs || previous.size !== metadata.size)
      && metadata.mtimeMs >= generationStartedAt;
    if (!isNewPath && !isChangedPath) continue;
    if (metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES) continue;
    try {
      const content = await readFile(path);
      if (content.length > MAX_IMAGE_BYTES) continue;
      const mime = detectImageMime(content);
      if (mime !== undefined) candidates.push({ content, mime });
    } catch {
      // The Codex process may still be closing the file; it is not usable yet.
    }
  }
  if (candidates.length > 1) {
    throw new CodexNativeImageError(
      'upstream_error',
      'Codex created multiple new local image artifacts; refusing to guess'
    );
  }
  return candidates[0];
}

async function allowedRoots(
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>
): Promise<string[]> {
  const workspaceRoot = resolve(input.cwd);
  const generatedRoot = resolve(join(input.codexHome, 'generated_images'));
  const codexHomeRoot = await realpath(input.codexHome).catch(() => undefined);
  const generatedRootReal = await realpath(generatedRoot).catch(() => generatedRoot);
  return [
    workspaceRoot,
    ...(codexHomeRoot !== undefined && isPathInside(codexHomeRoot, generatedRootReal)
      ? [generatedRootReal]
      : [])
  ];
}

function discoveryRoots(
  input: Pick<CodexNativeImageInput, 'cwd' | 'codexHome'>,
  codexThreadId?: string
): LocalArtifactScanRoot[] {
  const generatedRoot = resolve(join(input.codexHome, 'generated_images'));
  const codexHomeRoot = resolve(input.codexHome);
  if (codexThreadId !== undefined && /^[A-Za-z0-9_-]+$/.test(codexThreadId)) {
    return [
      {
        path: resolve(generatedRoot, codexThreadId),
        boundary: codexHomeRoot,
        recursive: true
      },
      { path: generatedRoot, boundary: codexHomeRoot, recursive: false }
    ];
  }
  return [{ path: generatedRoot, boundary: codexHomeRoot, recursive: true }];
}

async function listLocalArtifactFiles(roots: LocalArtifactScanRoot[]): Promise<string[]> {
  const files = new Set<string>();
  for (const scanRoot of roots) {
    const canonicalBoundary = await realpath(scanRoot.boundary).catch(() => undefined);
    const canonicalRoot = await realpath(scanRoot.path).catch(() => undefined);
    if (
      canonicalBoundary === undefined
      || canonicalRoot === undefined
      || !isPathInside(canonicalBoundary, canonicalRoot)
    ) continue;
    await walkLocalArtifactFiles(
      canonicalBoundary,
      canonicalRoot,
      files,
      scanRoot.recursive
    );
  }
  return [...files];
}

async function walkLocalArtifactFiles(
  root: string,
  directory: string,
  files: Set<string>,
  recursive: boolean
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const candidate = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!recursive) continue;
      await walkLocalArtifactFiles(root, candidate, files, recursive);
      continue;
    }
    if (!entry.isFile()) continue;
    const canonical = await realpath(candidate).catch(() => undefined);
    if (canonical !== undefined && isPathInside(root, canonical)) files.add(canonical);
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function detectImageMime(content: Buffer): ImageGenerationAsset['mime'] | undefined {
  if (content.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]))) {
    return 'image/png';
  }
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    content.length >= 12
    && content.subarray(0, 4).toString('ascii') === 'RIFF'
    && content.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

async function awaitProcessResult(
  process: { cancel(): void; result: Promise<CodexAppServerResult> },
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<CodexAppServerResult> {
  const timeout = Math.max(1, timeoutMs);
  return await new Promise<CodexAppServerResult>((resolveResult, rejectResult) => {
    let settled = false;
    const timer = setTimeout(() => {
      process.cancel();
      finishReject(new CodexNativeImageError(
        'upstream_error',
        `Codex native image generation timed out after ${timeout}ms`
      ));
    }, timeout);
    timer.unref?.();

    const abort = () => {
      process.cancel();
      finishReject(new CodexNativeImageError('upstream_error', 'Codex native image generation was canceled'));
    };
    const finishResolve = (value: CodexAppServerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolveResult(value);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      rejectResult(error);
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    process.result.then(finishResolve, finishReject);
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? value[key] as string : undefined;
}
