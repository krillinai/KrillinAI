import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { describe, expect, it } from 'vitest';
import { createKrillinDependencyLoader } from '../../src/creator/krillin/dependency-loader.js';

describe('KrillinAI on-demand dependency loader', () => {
  it('prepares the selected Windows Whisper.cpp model and serializes concurrent installs', async () => {
    const models: string[] = [];
    const phases: unknown[] = [];
    let active = 0;
    const loader = createKrillinDependencyLoader({
      root: '/tmp/whispercpp', platform: 'win32', arch: 'x64',
      whisperCppInstaller: { async ensure(input) {
        expect(active++).toBe(0);
        models.push(input.model);
        input.onPhase('cli');
        await Promise.resolve();
        input.onPhase('model');
        active--;
      } }
    });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisper.cpp';
    config.transcription.whisperCpp.model = 'tiny';
    const run = () => loader.ensure({ config, signal: new AbortController().signal, reportProgress: value => phases.push(value) });
    await Promise.all([run(), run()]);
    expect(models).toEqual(['tiny', 'tiny']);
    expect(phases).toContainEqual(expect.objectContaining({ dependency: 'whisper.cpp', dependencyPhase: 'model' }));
  });

  it('does not enable Windows x64 Whisper.cpp on ARM64', async () => {
    const loader = createKrillinDependencyLoader({ root: '/tmp/whispercpp', platform: 'win32', arch: 'arm64' });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisper.cpp';
    expect(loader.capabilities().transcription.providers.find(value => value.provider === 'whisper.cpp')?.available).toBe(false);
    await expect(loader.ensure({ config, signal: new AbortController().signal, reportProgress() {} })).rejects.toThrow('unavailable');
  });

  it('does not prepare WhisperKit when OpenAI is selected without an API key', async () => {
    let installs = 0;
    const loader = createKrillinDependencyLoader({
      root: '/tmp/opencreator-test-dependencies',
      platform: 'darwin',
      arch: 'arm64',
      whisperKitInstaller: {
        async isInstalled() {
          return false;
        },
        async install() {
          installs += 1;
        }
      }
    });
    const config = createDefaultCreatorServicesConfig();

    await loader.ensure({
      config,
      signal: new AbortController().signal,
      reportProgress() {}
    });

    expect(installs).toBe(0);
  });

  it('reports capabilities for the loader Runtime', () => {
    const loader = createKrillinDependencyLoader({
      root: '/tmp/opencreator-test-dependencies',
      platform: 'darwin',
      arch: 'arm64'
    });

    expect(loader.capabilities()).toMatchObject({
      platform: 'darwin',
      arch: 'arm64',
      transcription: {
        providers: expect.arrayContaining([
          expect.objectContaining({ provider: 'whisperkit', available: true }),
          expect.objectContaining({ provider: 'faster-whisper', available: false })
        ])
      }
    });
  });

  it('prepares WhisperKit once and reuses it for later stages', async () => {
    let installed = false;
    let installs = 0;
    const phases: string[] = [];
    const loader = createKrillinDependencyLoader({
      root: '/tmp/opencreator-test-dependencies',
      platform: 'darwin',
      arch: 'arm64',
      whisperKitInstaller: {
        async isInstalled() {
          return installed;
        },
        async install(input) {
          installs += 1;
          input.onPhase('cli');
          input.onPhase('model');
          installed = true;
        }
      }
    });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisperkit';
    const ensure = () => loader.ensure({
      config,
      signal: new AbortController().signal,
      reportProgress(progress) {
        if (typeof progress.dependencyPhase === 'string') {
          phases.push(progress.dependencyPhase);
        }
      }
    });

    await Promise.all([ensure(), ensure()]);
    await ensure();

    expect(installs).toBe(1);
    expect(phases).toContain('download');
    expect(phases).toContain('cli');
    expect(phases).toContain('model');
  });

  it('rejects WhisperKit on unsupported platforms without installing anything', async () => {
    let installs = 0;
    const loader = createKrillinDependencyLoader({
      root: '/tmp/opencreator-test-dependencies',
      platform: 'linux',
      arch: 'x64',
      whisperKitInstaller: {
        async isInstalled() {
          return false;
        },
        async install() {
          installs += 1;
        }
      }
    });
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisperkit';

    await expect(loader.ensure({
      config,
      signal: new AbortController().signal,
      reportProgress() {}
    })).rejects.toMatchObject({ code: 'dependency_not_packaged' });
    expect(installs).toBe(0);
  });
});
