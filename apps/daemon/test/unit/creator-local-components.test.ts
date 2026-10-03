import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createKrillinDependencyLoader } from '../../src/creator/krillin/dependency-loader.js';

function fixture() {
  let installed = false;
  let finish!: () => void;
  const install = vi.fn(async (input: { onPhase(phase: 'cli' | 'model'): void; onProgress?(progress: { state: 'downloading'; item: string; downloadedBytes: number; totalBytes: number; bytesPerSecond: number; remainingSeconds: number }): void }) => {
    input.onPhase('model');
    input.onProgress?.({ state: 'downloading', item: 'WhisperKit large-v2 model', downloadedBytes: 50, totalBytes: 100, bytesPerSecond: 10, remainingSeconds: 5 });
    await new Promise<void>(resolve => { finish = resolve; });
    installed = true;
  });
  const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-components-unit', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => installed, install } });
  const config = createDefaultCreatorServicesConfig();
  config.transcription.provider = 'whisperkit';
  return { loader, config, install, finish: () => finish() };
}

describe('shared local transcription components', () => {
  it.each(['openai', 'aliyun', 'funasr'] as const)('prepares WhisperKit independently of the selected %s provider and shares it with tasks', async provider => {
    const test = fixture();
    test.config.transcription.provider = provider;
    const saved = structuredClone(test.config);
    const status = await test.loader.download(test.config, 'whisperkit');
    expect(status).toMatchObject({ selectedProvider: provider, selectedModel: null });
    await vi.waitFor(() => expect(test.install).toHaveBeenCalledOnce());

    const taskConfig = structuredClone(test.config);
    taskConfig.transcription.provider = 'whisperkit';
    const task = test.loader.ensure({ config: taskConfig, signal: new AbortController().signal, reportProgress() {} });
    test.finish();
    await task;

    expect(test.config).toEqual(saved);
    expect(test.install).toHaveBeenCalledOnce();
    expect((await test.loader.status(test.config)).components.find(component => component.id === 'whisperkit')).toMatchObject({ state: 'ready', model: 'large-v2' });
    test.loader.close();
  });

  it('uses the requested component model and proxy without changing transcription settings', async () => {
    let installed = false;
    const install = vi.fn(async () => { installed = true; });
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-independent-whispercpp', platform: 'win32', arch: 'x64', whisperCppInstaller: { isInstalled: async () => installed, install } });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'openai';
    config.transcription.whisperCpp.model = 'large-v3-turbo';
    config.proxy = 'http://127.0.0.1:7890';
    const saved = structuredClone(config);

    expect((await loader.status(config)).components.find(component => component.id === 'whisper.cpp')?.model).toBe('large-v3-turbo');
    await loader.download(config, 'whisper.cpp');
    await vi.waitFor(() => expect(install).toHaveBeenCalledWith(expect.objectContaining({ model: 'large-v3-turbo', proxy: config.proxy })));
    await vi.waitFor(async () => expect((await loader.status(config)).components.find(component => component.id === 'whisper.cpp')?.state).toBe('ready'));

    expect(config).toEqual(saved);
    loader.close();
  });

  it('checks a ready component without downloading valid resources again', async () => {
    const install = vi.fn();
    const isInstalled = vi.fn(async () => true);
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-ready-whisperkit', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled, install } });
    const config = createDefaultCreatorServicesConfig();
    expect((await loader.status(config)).components.find(component => component.id === 'whisperkit')?.state).toBe('ready');
    const checksBefore = isInstalled.mock.calls.length;

    await loader.download(config, 'whisperkit');
    await vi.waitFor(() => expect(isInstalled.mock.calls.length).toBeGreaterThan(checksBefore));
    await vi.waitFor(async () => expect((await loader.status(config)).components.find(component => component.id === 'whisperkit')?.state).toBe('ready'));

    expect(install).not.toHaveBeenCalled();
    expect(config.transcription.provider).toBe('openai');
    loader.close();
  });

  it('exposes a failed installation and lets users retry the same component', async () => {
    let installed = false;
    const install = vi.fn().mockRejectedValueOnce(new Error('download connection failed')).mockImplementationOnce(async () => { installed = true; });
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-component-retry', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => installed, install } });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisperkit';
    await expect(loader.ensure({ config, signal: new AbortController().signal, reportProgress() {} })).rejects.toThrow('download connection failed');
    expect((await loader.status(config)).components.find(component => component.id === 'whisperkit')).toMatchObject({ state: 'failed', error: expect.stringContaining('download connection failed') });
    await loader.ensure({ config, signal: new AbortController().signal, reportProgress() {} });
    expect((await loader.status(config)).components.find(component => component.id === 'whisperkit')?.state).toBe('ready');
    expect(install).toHaveBeenCalledTimes(2);
    loader.close();
  });
  it('shares a manual download with task subscribers and exposes real progress', async () => {
    const test = fixture();
    expect((await test.loader.status(test.config)).components.find(component => component.id === 'whisperkit')?.state).toBe('not_installed');
    await test.loader.download(test.config);
    await vi.waitFor(() => expect(test.install).toHaveBeenCalledOnce());
    const listener = vi.fn();
    const task = test.loader.ensure({ config: test.config, signal: new AbortController().signal, reportProgress: listener });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'downloading_dependencies', dependencyPercent: 50, downloadedBytes: 50, totalBytes: 100 })));
    const status = await test.loader.status(test.config);
    expect(status.components.find(component => component.id === 'whisperkit')).toMatchObject({ state: 'downloading', percent: 50, model: 'large-v2', item: 'WhisperKit large-v2 model' });
    test.finish();
    await task;
    expect(test.install).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'dependencies_ready', message: expect.stringContaining('开始语音转录') }));
    expect((await test.loader.status(test.config)).components.find(component => component.id === 'whisperkit')).toMatchObject({ state: 'ready', version: '1.1.0' });
    test.loader.close();
  });

  it('canceling one task does not cancel the shared download or another task', async () => {
    const test = fixture();
    const canceled = new AbortController();
    const first = test.loader.ensure({ config: test.config, signal: canceled.signal, reportProgress() {} });
    const second = test.loader.ensure({ config: test.config, signal: new AbortController().signal, reportProgress() {} });
    await vi.waitFor(() => expect(test.install).toHaveBeenCalledOnce());
    canceled.abort();
    await expect(first).rejects.toMatchObject({ code: 'creator_stage_canceled' });
    test.finish();
    await second;
    expect(test.install).toHaveBeenCalledOnce();
    test.loader.close();
  });

  it('does not offer installation on an unsupported Runtime', async () => {
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-components-unit', platform: 'linux', arch: 'x64' });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisperkit';
    expect((await loader.status(config)).components.find(component => component.id === 'whisperkit')?.state).toBe('unsupported');
    await expect(loader.download(config)).rejects.toThrow('unavailable');
    config.transcription.provider = 'openai';
    await expect(loader.download(config, 'whisperkit')).rejects.toThrow('unavailable');
    loader.close();
  });
});
