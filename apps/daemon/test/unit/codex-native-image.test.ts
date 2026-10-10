import type { CreateImageGenerationRequest } from '@opencreator/protocol';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodexExecError, startCodexExec, type RunCodexExecInput } from '../../src/codex/runner.js';
import { generateCodexNativeImage } from '../../src/image-generation/codex-native.js';
import { generateImageContents } from '../../src/image-generation/provider.js';
import { inspectCodexImageRuntime } from '../../src/image-generation/codex-runtime.js';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';

const fixture = fileURLToPath(new URL('../fixtures/fake-codex-image.mjs', import.meta.url));
const request: CreateImageGenerationRequest = { provider: 'codex-native', prompt: 'one orange cat', count: 1, size: '1024x1024', quality: 'medium' };
let home = '';

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'codex-native-image-test-'));
  await writeFile(join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'private-oauth-secret' }, OPENAI_API_KEY: 'old-api-secret' }));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(home, { recursive: true, force: true });
});

function runtime(mode = 'success', thread = 'image-test-thread') {
  return {
    codexHome: home, codexBin: process.execPath,
    checkNativeCapability: async () => ({ supported: true, version: 'codex-test' }),
    startExec: (input: RunCodexExecInput) => startCodexExec({ ...input, args: [fixture, ...input.args], env: { ...input.env, TEST_CODEX_IMAGE_MODE: mode, TEST_CODEX_IMAGE_THREAD: thread, TEST_CODEX_IMAGE_OUTSIDE: home } })
  };
}

describe('ChatGPT native image execution', () => {
  it('uses a real child process, returns a new artifact and reports standard progress', async () => {
    const onProgress = vi.fn();
    const image = await generateCodexNativeImage({ runtime: runtime(), request, referenceImages: [], signal: new AbortController().signal, onProgress });
    expect(image.mime).toBe('image/png');
    expect(image.content.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(onProgress.mock.calls.map(([progress]) => progress.phase)).toEqual(expect.arrayContaining(['preparing_native_image', 'generating_image', 'collecting_outputs']));
    expect(onProgress.mock.calls.every(([progress]) => typeof progress.message === 'string' && !('percent' in progress))).toBe(true);
  });

  it('accepts generation that recovers from a transient stream reconnect', async () => {
    await expect(generateCodexNativeImage({ runtime: runtime('recovered'), request, referenceImages: [], signal: new AbortController().signal })).resolves.toMatchObject({ mime: 'image/png' });
  });

  it('discovers output when the CLI omits image tool events', async () => {
    await expect(generateCodexNativeImage({ runtime: runtime('cli-only'), request, referenceImages: [], signal: new AbortController().signal })).resolves.toMatchObject({ mime: 'image/png' });
  });

  it.each(['missing-reference', 'missing-reference-stderr'])('keeps tool refusal details despite successful process exit (%s)', async mode => {
    const error = await generateImageContents(request, createDefaultCreatorServicesConfig(), { codexNative: runtime(mode) }).catch(error => error);
    expect(error).toMatchObject({ code: 'upstream_error', publicFacts: {
      kind: 'validation', provider: 'codex-native', upstreamCode: 'IMAGE_REFERENCE_MISSING',
      upstreamMessage: expect.stringContaining('参考图')
    } });
    expect(JSON.stringify(error.publicFacts)).not.toContain('private-oauth-secret');
  });

  it('keeps reference images attached and does not mistake them for generated images', async () => {
    const base = runtime('text-only');
    const reference = Buffer.from('reference-image');
    let workspace = '';
    const startExec = vi.fn((input: RunCodexExecInput) => {
      workspace = input.cwd;
      expect(input.args).toContain('--image');
      expect(input.prompt).toContain('attached images');
      return { cancel() {}, result: readFile(input.args[input.args.indexOf('--image') + 1]!).then(content => {
        expect(content).toEqual(reference);
        return base.startExec(input).result;
      }) };
    });
    await expect(generateCodexNativeImage({ runtime: { ...base, startExec }, request, referenceImages: [{ content: reference, mime: 'image/png' }], signal: new AbortController().signal })).rejects.toThrow('唯一的新图片');
    await expect(readFile(join(workspace, 'reference-0.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('only discovers artifacts for the current thread and isolates concurrent requests', async () => {
    const [first, second] = await Promise.all(['thread-first', 'thread-second'].map(thread => generateCodexNativeImage({ runtime: runtime('home', thread), request, referenceImages: [], signal: new AbortController().signal })));
    expect(first!.content).toEqual(second!.content);
    await expect(generateCodexNativeImage({ runtime: runtime('other-thread'), request, referenceImages: [], signal: new AbortController().signal })).rejects.toThrow('唯一的新图片');
  });

  it('rejects a thread directory symlink pointing to another thread', async () => {
    const generated = join(home, 'generated_images');
    await mkdir(join(generated, 'different-thread'), { recursive: true });
    await symlink(join(generated, 'different-thread'), join(generated, 'image-test-thread'));
    await expect(generateCodexNativeImage({ runtime: runtime('home'), request, referenceImages: [], signal: new AbortController().signal })).rejects.toThrow('唯一的新图片');
  });

  it.each([
    ['text-only', '唯一的新图片'], ['old', '已有图片'], ['outside', '不属于当前生图任务'],
    ['symlink', '不属于当前生图任务'], ['invalid', '不是受支持'], ['failure', '重新登录'], ['quota', '额度']
  ])('rejects unsafe or unsuccessful results (%s)', async (mode, message) => {
    await expect(generateCodexNativeImage({ runtime: runtime(mode), request, referenceImages: [], signal: new AbortController().signal })).rejects.toThrow(message);
  });

  it('cancels a running child when the user aborts', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const generating = new Promise<void>(resolve => { started = resolve; });
    const task = generateCodexNativeImage({ runtime: runtime('waiting'), request, referenceImages: [], signal: controller.signal, onProgress: progress => { if (progress.phase === 'generating_image') started(); } });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await generating;
    controller.abort();
    await rejected;
  });

  it('reports execution timeouts explicitly instead of a user cancellation', async () => {
    const base = runtime();
    await expect(generateCodexNativeImage({
      runtime: { ...base, startExec: () => ({ cancel() {}, result: Promise.reject(new CodexExecError({ message: 'timeout token=private-oauth-secret', terminationReason: 'timeout', stdoutLines: [], stderr: '' })) }) },
      request, referenceImages: [], signal: new AbortController().signal
    })).rejects.toThrow('原生生图超时');
  });
});

describe('Codex authentication dispatch and readiness', () => {
  it('routes OAuth only through native execution without sending HTTP or secrets', async () => {
    const fetchImpl = vi.fn();
    const base = runtime();
    const startExec = vi.fn(base.startExec);
    const result = await generateImageContents(request, createDefaultCreatorServicesConfig(), { codexNative: { ...base, startExec }, fetchImpl });
    expect(result.model).toBe('codex-native');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(startExec.mock.calls)).not.toContain('private-oauth-secret');
    expect(JSON.stringify(startExec.mock.calls)).not.toContain('old-api-secret');
  });

  it('removes inherited API credentials from the native child environment', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'inherited-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://wrong-provider.example.test/v1');
    vi.stubEnv('CODEX_API_KEY', 'inherited-codex-key');
    vi.stubEnv('CODEX_ACCESS_TOKEN', 'inherited-agent-token');
    try {
      await expect(generateCodexNativeImage({ runtime: runtime(), request, referenceImages: [], signal: new AbortController().signal })).resolves.toMatchObject({ mime: 'image/png' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not fall back to HTTP after a native failure', async () => {
    const fetchImpl = vi.fn();
    const task = generateImageContents(request, createDefaultCreatorServicesConfig(), { codexNative: runtime('failure'), fetchImpl });
    await expect(task).rejects.toMatchObject({ code: 'upstream_error', message: expect.stringContaining('重新登录') });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks native execution when Runtime capability is missing', async () => {
    const startExec = vi.fn(runtime().startExec);
    const codexNative = { ...runtime(), startExec, checkNativeCapability: async () => ({ supported: false, version: 'old-runtime' }) };
    await expect(generateImageContents(request, createDefaultCreatorServicesConfig(), { codexNative })).rejects.toMatchObject({ code: 'config_missing', message: expect.stringContaining('不支持原生生图') });
    expect(startExec).not.toHaveBeenCalled();
    await expect(inspectCodexImageRuntime(codexNative)).resolves.toMatchObject({ authentication: 'chatgpt', ready: false, executionMode: null });
  });

  it('reports native capability without exposing OAuth credentials', async () => {
    const status = await inspectCodexImageRuntime(runtime());
    expect(status).toMatchObject({ authentication: 'chatgpt', ready: true, executionMode: 'native', version: 'codex-test' });
    expect(JSON.stringify(status)).not.toContain('secret');
  });

  it('does not require a CLI or probe for the existing API path', async () => {
    const checkNativeCapability = vi.fn();
    await expect(inspectCodexImageRuntime({ codexHome: home, readProvider: async () => ({ baseUrl: 'https://images.example.test/v1', apiKey: 'api-secret', model: 'gpt-image-1' }), checkNativeCapability })).resolves.toMatchObject({ authentication: 'api_key', ready: true, executionMode: 'api' });
    expect(checkNativeCapability).not.toHaveBeenCalled();
  });

  it('blocks ChatGPT mode without a Codex executable', async () => {
    await expect(inspectCodexImageRuntime({ codexHome: home })).resolves.toMatchObject({ authentication: 'chatgpt', ready: false, message: expect.stringContaining('缺少 Codex') });
  });
});
