import { safePublicErrorMessage, type CreateImageGenerationRequest, type PublicErrorFacts } from '@opencreator/protocol';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { buildCodexExecArgs } from '../codex/argv.js';
import { CodexExecError, startCodexExec, type CodexExecProcess } from '../codex/runner.js';
import type { CodexNativeImageRuntime, GeneratedImageContent } from './provider.js';
import { isRecord } from '../creator-services/upstream-fetch.js';

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const TIMEOUT_MS = 180_000;
export type NativeImageProgress = { phase: string; message: string };

class CodexNativeImageError extends Error {
  readonly publicFacts: PublicErrorFacts;
  constructor(message: string, kind: PublicErrorFacts['kind'], detail = message, upstreamCode?: string) {
    super(message);
    this.name = 'CodexNativeImageError';
    this.publicFacts = {
      kind, provider: 'codex-native',
      upstreamMessage: safePublicErrorMessage((detail === message ? message : `${message}。${detail}`).slice(0, 4_000)) ?? message,
      ...(upstreamCode === undefined ? {} : { upstreamCode })
    };
  }
}

export async function generateCodexNativeImage(input: {
  runtime: CodexNativeImageRuntime;
  request: CreateImageGenerationRequest;
  referenceImages: GeneratedImageContent[];
  signal: AbortSignal;
  onProgress?(progress: NativeImageProgress): void;
}): Promise<GeneratedImageContent> {
  input.signal.throwIfAborted();
  if (!input.runtime.codexBin) throw new CodexNativeImageError('The Codex executable is missing from this Runtime', 'configuration');
  const workdir = await mkdtemp(join(tmpdir(), 'opencreator-codex-image-'));
  const outputDir = join(workdir, 'output');
  let process: CodexExecProcess | undefined;
  const abort = () => process?.cancel();
  let threadId: string | undefined;
  let savedPath: string | undefined;
  let failure: CodexNativeImageError | undefined;
  let streamError: CodexNativeImageError | undefined;
  let lastAgentMessage = '';
  let turnFailed = false;
  const report = (phase: string, message: string) => {
    if (!input.signal.aborted) input.onProgress?.({ phase, message });
  };
  try {
    await mkdir(outputDir, { mode: 0o700 });
    const imagePaths: string[] = [];
    for (const [index, image] of input.referenceImages.entries()) {
      if (!image.content.length || image.content.length > MAX_IMAGE_BYTES) throw new Error('The reference image is empty or exceeds the size limit');
      const path = join(workdir, `reference-${index}.${image.mime === 'image/jpeg' ? 'jpg' : image.mime === 'image/webp' ? 'webp' : 'png'}`);
      await writeFile(path, image.content, { mode: 0o600 });
      imagePaths.push(path);
    }
    input.signal.throwIfAborted();
    report('preparing_native_image', 'Preparing image generation with ChatGPT sign-in and the native Codex tool.');
    const startedAt = Date.now();
    process = (input.runtime.startExec ?? startCodexExec)({
      codexBin: input.runtime.codexBin,
      codexHome: input.runtime.codexHome,
      cwd: workdir,
      args: [...buildCodexExecArgs({ cwd: workdir, sandbox: 'workspace-write', imagePaths, imageGenerationOnly: true }), '--ephemeral'],
      prompt: [
        'Generate exactly one image using the native image_generation tool.',
        'Do not use a shell, scripts, an external image API, or API keys. Text alone is not a successful image result.',
        `Requested canvas: ${input.request.size}. Requested quality: ${input.request.quality}.`,
        imagePaths.length ? 'Use all attached images as references, preserving the requested subject and identity.' : '',
        `Save the generated image under ${outputDir} if the tool allows choosing its output location.`,
        'Otherwise retain the native generated image artifact. Do not use an existing image as the output.',
        `User image brief:\n${input.request.prompt.trim()}`
      ].filter(Boolean).join('\n'),
      timeoutMs: TIMEOUT_MS,
      inactivityTimeoutMs: TIMEOUT_MS,
      env: { OPENAI_API_KEY: undefined, OPENAI_BASE_URL: undefined, CODEX_API_KEY: undefined, CODEX_ACCESS_TOKEN: undefined },
      onStdoutLine(line) {
        let event: Record<string, unknown>;
        try { event = JSON.parse(line); } catch { return; }
        if (!isRecord(event)) return;
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
        if (event.type === 'turn.started') report('generating_image', 'Generating images with ChatGPT sign-in. Please wait.');
        if (event.type === 'turn.failed' || event.type === 'error') {
          const error = isRecord(event.error) ? event.error : event;
          if (typeof error.message === 'string') streamError = nativeFailure(error.message);
          if (event.type === 'turn.failed') turnFailed = true;
        }
        const item = isRecord(event.item) ? event.item : undefined;
        if (event.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string') {
          lastAgentMessage = item.text.slice(0, 4_000);
        }
        if (item && (item.type === 'image_generation' || item.type === 'imageGeneration')) {
          report('generating_image', 'The native Codex image tool is processing the image. Please wait.');
          const path = item.saved_path ?? item.savedPath;
          if (typeof path === 'string') savedPath = path;
          if (item.status === 'failed' || item.failure) {
            const error = isRecord(item.failure) ? item.failure : item;
            failure = nativeFailure(typeof error.message === 'string' ? error.message
              : typeof error.type === 'string' ? error.type : 'The native Codex image tool failed');
          } else if (item.status === 'completed') failure = undefined;
        }
      }
    });
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) abort();
    const result = await process.result.catch(error => {
      input.signal.throwIfAborted();
      if (error instanceof CodexExecError) {
        if (['timeout', 'inactivity_timeout', 'spawn_timeout'].includes(error.terminationReason)) {
          throw new CodexNativeImageError('Codex native image generation timed out. Try again later.', 'timeout');
        }
        throw nativeFailure(error.stderr || error.message);
      }
      throw new CodexNativeImageError('Could not start or run Codex native image generation. Check the Runtime.', 'unavailable');
    });
    input.signal.throwIfAborted();
    if (result.terminationReason !== 'completed' || result.exitCode !== 0 || turnFailed || failure) {
      throw failure ?? streamError ?? nativeFailure(result.stderr || lastAgentMessage);
    }
    report('collecting_outputs', 'Codex finished. Checking generated images and saving outputs.');
    const roots = [await realpath(workdir)];
    const references = new Set(await Promise.all(imagePaths.map(path => realpath(path))));
    if (threadId && /^[A-Za-z0-9_-]+$/.test(threadId)) {
      const home = await realpath(input.runtime.codexHome);
      const generated = await realpath(join(home, 'generated_images', threadId)).catch(() => undefined);
      if (generated === join(home, 'generated_images', threadId)) roots.push(generated);
    }
    const candidates = savedPath === undefined
      ? (await Promise.all(roots.map(root => imageFiles(root)))).flat()
      : [savedPath];
    const images: GeneratedImageContent[] = [];
    for (const candidate of candidates) {
      if (!isAbsolute(candidate) || candidate.includes('\0')) throw new Error('Codex returned an invalid image path');
      const path = await realpath(candidate);
      if (references.has(path)) continue;
      if (!roots.some(root => inside(root, path))) throw new Error('The Codex image output does not belong to this task. Reading it was denied.');
      const info = await stat(path);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_BYTES) throw new Error('The Codex image output has an invalid size');
      if (info.mtimeMs < startedAt - 1000) {
        if (savedPath !== undefined) throw new Error('Codex returned an existing image without generating a new output');
        continue;
      }
      const content = await readFile(path);
      if (content.length > MAX_IMAGE_BYTES) throw new Error('The Codex image output exceeds the size limit');
      const mime = imageMime(content);
      if (!mime) throw new Error('The Codex image output is not a supported PNG, JPEG, or WebP image');
      images.push({ content, mime });
    }
    if (images.length !== 1) {
      let diagnostic = nativeFailure(lastAgentMessage || result.stderr);
      if (diagnostic.publicFacts.kind === 'provider-failed' && result.stderr) diagnostic = nativeFailure(result.stderr);
      // exec --json can omit image tool events and exit successfully after a tool refusal.
      if (images.length === 0 && diagnostic.publicFacts.kind !== 'provider-failed') throw diagnostic;
      const message = `Codex returned ${images.length} new images instead of exactly one. A text reply cannot be treated as a generated image.`;
      throw new CodexNativeImageError(message, 'invalid-response',
        `${message} ${lastAgentMessage ? `Last Codex reply: ${lastAgentMessage}` : 'Codex returned no image or specific failure reason. Try again. If it keeps failing, check local Codex sign-in, the network, and native image capabilities.'}`,
        'IMAGE_OUTPUT_MISSING');
    }
    return images[0]!;
  } catch (error) {
    input.signal.throwIfAborted();
    if (error instanceof CodexNativeImageError) throw error;
    if (error instanceof Error) throw new CodexNativeImageError(
      safePublicErrorMessage(error.message) ?? 'Could not validate the Codex image output', 'invalid-response'
    );
    throw error;
  } finally {
    input.signal.removeEventListener('abort', abort);
    await rm(workdir, { recursive: true, force: true });
  }
}

function nativeFailure(message: string): CodexNativeImageError {
  if (/requested the last \d+ conversation images, but only 0 were available|no (?:available |uploaded |attached |reference )*(?:images?|photos?|pictures?)|(?:没有|缺少|未上传|未提供|找不到|不可用)[^。\n]{0,30}(?:人物照片|参考图|上传[^。\n]{0,10}(?:图片|照片))|(?:参考图|人物照片)[^。\n]{0,15}(?:缺失|未上传|不可用)/i.test(message)) {
    return new CodexNativeImageError('Codex cannot access the required reference image. Upload it and try again.', 'validation', message, 'IMAGE_REFERENCE_MISSING');
  }
  if (/unauthorized|\b401\b|token.*expired|refresh.*token|not.*logged|authentication|login|sign.?in/i.test(message)) {
    return new CodexNativeImageError('Local Codex ChatGPT sign-in expired or could not be verified. Sign in again and retry.', 'unauthorized', message);
  }
  if (/usage.?limit|rate.?limit|quota|\b429\b|limit.?exceeded/i.test(message)) {
    return new CodexNativeImageError('ChatGPT image quota or request rate is limited. Try again later.', 'rate-limited', message);
  }
  if (/unsupported|not.*support|not.*available|\b403\b|access.*denied/i.test(message)) {
    return new CodexNativeImageError('This ChatGPT account or Codex Runtime cannot use native image generation. Check account permissions or update the Runtime.', 'unsupported', message);
  }
  if (/policy|moderation|safety|content_filter/i.test(message)) {
    return new CodexNativeImageError('The image request was denied by the safety policy. Adjust the description and retry.', 'http-rejected', message);
  }
  if (/timed?\s*out|timeout/i.test(message)) {
    return new CodexNativeImageError('The Codex native image request timed out. Try again later.', 'timeout', message);
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return new CodexNativeImageError('Codex image service DNS lookup failed. Check the network and retry.', 'dns', message);
  }
  if (/ECONNREFUSED/i.test(message)) {
    return new CodexNativeImageError('The Codex image service connection was refused. Check the network or proxy.', 'connection-refused', message);
  }
  if (/ECONNRESET|connection.*reset/i.test(message)) {
    return new CodexNativeImageError('The Codex image service connection was interrupted. Check the network and retry.', 'connection-reset', message);
  }
  return new CodexNativeImageError('Codex native image generation failed. Review the provider message and retry.', 'provider-failed', message);
}

async function imageFiles(root: string, depth = 0): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory() && depth < 3) files.push(...await imageFiles(path, depth + 1));
    else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) files.push(path);
    if (files.length > 32) throw new Error('Codex returned too many image outputs for this task');
  }
  return files;
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function imageMime(content: Buffer): GeneratedImageContent['mime'] | undefined {
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.subarray(0, 4).toString() === 'RIFF' && content.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return undefined;
}
