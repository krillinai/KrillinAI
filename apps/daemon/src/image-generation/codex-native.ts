import type { CreateImageGenerationRequest } from '@opencreator/protocol';
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

export async function generateCodexNativeImage(input: {
  runtime: CodexNativeImageRuntime;
  request: CreateImageGenerationRequest;
  referenceImages: GeneratedImageContent[];
  signal: AbortSignal;
  onProgress?(progress: NativeImageProgress): void;
}): Promise<GeneratedImageContent> {
  input.signal.throwIfAborted();
  if (!input.runtime.codexBin) throw new Error('当前 Runtime 缺少 Codex 可执行程序');
  const workdir = await mkdtemp(join(tmpdir(), 'opencreator-codex-image-'));
  const outputDir = join(workdir, 'output');
  let process: CodexExecProcess | undefined;
  const abort = () => process?.cancel();
  let threadId: string | undefined;
  let savedPath: string | undefined;
  let failure: string | undefined;
  let streamError: string | undefined;
  let turnFailed = false;
  const report = (phase: string, message: string) => {
    if (!input.signal.aborted) input.onProgress?.({ phase, message });
  };
  try {
    await mkdir(outputDir, { mode: 0o700 });
    const imagePaths: string[] = [];
    for (const [index, image] of input.referenceImages.entries()) {
      if (!image.content.length || image.content.length > MAX_IMAGE_BYTES) throw new Error('参考图片超过大小限制或内容为空');
      const path = join(workdir, `reference-${index}.${image.mime === 'image/jpeg' ? 'jpg' : image.mime === 'image/webp' ? 'webp' : 'png'}`);
      await writeFile(path, image.content, { mode: 0o600 });
      imagePaths.push(path);
    }
    input.signal.throwIfAborted();
    report('preparing_native_image', '正在准备 ChatGPT 登录态生图；将使用 Codex 原生工具，不会调用图片 API Key 接口。');
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
        if (event.type === 'turn.started') report('generating_image', '正在通过 ChatGPT 登录态生成图片，请稍候。');
        if (event.type === 'turn.failed' || event.type === 'error') {
          const error = isRecord(event.error) ? event.error : event;
          if (typeof error.message === 'string') streamError = nativeFailureMessage(error.message);
          if (event.type === 'turn.failed') turnFailed = true;
        }
        const item = isRecord(event.item) ? event.item : undefined;
        if (item && (item.type === 'image_generation' || item.type === 'imageGeneration')) {
          report('generating_image', 'Codex 原生生图工具正在处理图片，请稍候。');
          const path = item.saved_path ?? item.savedPath;
          if (typeof path === 'string') savedPath = path;
          if (item.status === 'failed' || item.failure) {
            const error = isRecord(item.failure) ? item.failure : item;
            failure = typeof error.message === 'string' ? nativeFailureMessage(error.message)
              : typeof error.type === 'string' ? nativeFailureMessage(error.type) : 'Codex 原生生图工具执行失败';
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
          throw new Error('Codex 原生生图超时，请稍后重试');
        }
        throw new Error(nativeFailureMessage(error.message));
      }
      throw new Error('无法启动或执行 Codex 原生生图，请检查 Runtime');
    });
    input.signal.throwIfAborted();
    if (result.terminationReason !== 'completed' || result.exitCode !== 0 || turnFailed || failure) {
      throw new Error(failure ?? streamError ?? nativeFailureMessage(result.stderr));
    }
    report('collecting_outputs', '图片已生成，正在检查并保存本地产物。');
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
      if (!isAbsolute(candidate) || candidate.includes('\0')) throw new Error('Codex 返回的图片路径无效');
      const path = await realpath(candidate);
      if (references.has(path)) continue;
      if (!roots.some(root => inside(root, path))) throw new Error('Codex 图片产物不属于当前生图任务，已拒绝读取');
      const info = await stat(path);
      if (!info.isFile() || info.size <= 0 || info.size > MAX_IMAGE_BYTES) throw new Error('Codex 图片产物大小无效');
      if (info.mtimeMs < startedAt - 1000) {
        if (savedPath !== undefined) throw new Error('Codex 返回了已有图片，未产生新的生图结果');
        continue;
      }
      const content = await readFile(path);
      if (content.length > MAX_IMAGE_BYTES) throw new Error('Codex 图片产物超过大小限制');
      const mime = imageMime(content);
      if (!mime) throw new Error('Codex 图片产物不是受支持的 PNG、JPEG 或 WebP 图片');
      images.push({ content, mime });
    }
    if (images.length !== 1) throw new Error(`Codex 没有返回唯一的新图片产物（${images.length} 张），不能将文字回复视为生图成功`);
    return images[0]!;
  } finally {
    input.signal.removeEventListener('abort', abort);
    await rm(workdir, { recursive: true, force: true });
  }
}

function nativeFailureMessage(message: string): string {
  if (/unauthorized|401|token.*expired|refresh.*token|not.*logged|authentication|login|sign.?in/i.test(message)) {
    return 'ChatGPT 登录已失效或无法验证，请在 Agent 设置中重新登录后重试';
  }
  if (/usage.?limit|rate.?limit|quota|429|limit.?exceeded/i.test(message)) {
    return 'ChatGPT 生图额度或请求频率受限，请稍后重试';
  }
  if (/unsupported|not.*support|not.*available|403|access.*denied/i.test(message)) {
    return '当前 ChatGPT 账号或 Codex Runtime 无法使用原生生图，请检查账号权限或更新 Runtime';
  }
  if (/policy|moderation|safety|content_filter/i.test(message)) {
    return '图片请求被安全策略拒绝，请调整描述后重试';
  }
  return 'Codex 原生生图失败，请检查登录状态、网络或 Runtime 后重试';
}

async function imageFiles(root: string, depth = 0): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory() && depth < 3) files.push(...await imageFiles(path, depth + 1));
    else if (entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name)) files.push(path);
    if (files.length > 32) throw new Error('Codex 当前任务返回了过多图片产物');
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
