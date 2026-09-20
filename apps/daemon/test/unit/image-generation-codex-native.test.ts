import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import type {
  CodexAppServerHost,
  CodexAppServerResult,
  CodexAppServerTurnInput
} from '../../src/codex/app-server-host-2026-07-28.js';
import { generateImageContents } from '../../src/image-generation/provider.js';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

describe('codex-native provider dispatch', () => {
  let root = '';

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = '';
  });

  it('uses the local Codex host and never calls the remote image fetcher', async () => {
    root = await mkdtemp(join(tmpdir(), 'opencreator-native-dispatch-'));
    const codexHome = join(root, 'codex-home');
    const savedPath = join(codexHome, 'generated_images', 'result.png');
    await mkdir(join(codexHome, 'generated_images'), { recursive: true });
    await writeFile(savedPath, png);
    const createHost = fakeHost(savedPath);
    const fetchImpl = vi.fn() as typeof fetch;
    const config = createDefaultCreatorServicesConfig();
    config.image.provider = 'codex-native';

    const result = await generateImageContents({
      prompt: 'an original orange cat',
      provider: 'codex-native',
      size: '1024x1024',
      quality: 'medium',
      count: 1
    }, config, {
      fetchImpl,
      codexNative: {
        codexBin: 'codex',
        codexHome,
        cwd: root,
        createHost
      }
    });

    expect(result).toMatchObject({ model: 'codex-native' });
    expect(result.contents[0]).toMatchObject({ content: png, mime: 'image/png' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createHost).toHaveBeenCalledTimes(1);
  });

  it('rejects native requests for more than one image without starting a host', async () => {
    const config = createDefaultCreatorServicesConfig();
    const createHost = vi.fn();
    config.image.provider = 'codex-native';

    await expect(generateImageContents({
      prompt: 'cat',
      provider: 'codex-native',
      size: '1024x1024',
      quality: 'low',
      count: 2
    }, config, {
      codexNative: {
        codexBin: 'codex',
        codexHome: 'C:\\codex-home',
        cwd: 'C:\\workspace',
        createHost
      }
    })).rejects.toMatchObject({
      code: 'unsupported_capability',
      message: expect.stringContaining('one image')
    });
    expect(createHost).not.toHaveBeenCalled();
  });

  it('reports missing native runtime settings as configuration error without API fallback', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.image.provider = 'codex-native';
    const fetchImpl = vi.fn() as typeof fetch;

    await expect(generateImageContents({
      prompt: 'cat',
      provider: 'codex-native',
      size: '1024x1024',
      quality: 'low',
      count: 1
    }, config, { fetchImpl })).rejects.toMatchObject({
      code: 'config_missing'
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function fakeHost(savedPath: string) {
  return vi.fn((): CodexAppServerHost => ({
    pid: 123,
    started: Promise.resolve(123),
    run: vi.fn((input: CodexAppServerTurnInput) => ({
      cancel: vi.fn(),
      result: (async () => {
        await input.onNotification?.({
          method: 'item/completed',
          params: {
            item: {
              type: 'imageGeneration',
              status: 'completed',
              failure: null,
              savedPath
            }
          }
        });
        return completedResult;
      })()
    })),
    isReusable: vi.fn(() => false),
    close: vi.fn(async () => undefined)
  }));
}

const completedResult: CodexAppServerResult = {
  threadId: 'thread-1',
  turnId: 'turn-1',
  turnStatus: 'completed',
  stderr: '',
  terminationReason: 'completed',
  outputTruncation: {
    stderr: { truncated: false, droppedBytes: 0, droppedItems: 0 },
    frames: { truncated: false, droppedBytes: 0, droppedItems: 0 }
  }
};
