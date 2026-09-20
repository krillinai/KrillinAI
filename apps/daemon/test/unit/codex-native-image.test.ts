import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CodexAppServerHost,
  CodexAppServerHostInput,
  CodexAppServerResult,
  CodexAppServerTurnInput
} from '../../src/codex/app-server-host-2026-07-28.js';
import {
  CodexNativeImageError,
  generateCodexNativeImage
} from '../../src/image-generation/codex-native.js';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

describe('Codex native image adapter', () => {
  afterEach(async () => {
    await Promise.all(testRoots.map(root => rm(root, { recursive: true, force: true })));
    testRoots = [];
  });

  it('runs the authenticated local app-server and imports its image artifact', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const savedPath = join(codexHome, 'generated_images', 'result.png');
    await mkdir(join(codexHome, 'generated_images'), { recursive: true });
    await writeFile(savedPath, png);
    const createHost = fakeHost({ savedPath });

    const result = await generateCodexNativeImage({
      prompt: 'an original orange cat',
      size: '1024x1024',
      quality: 'medium',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost
    });

    expect(result).toMatchObject({ content: png, mime: 'image/png', model: 'codex-native' });
    expect(createHost).toHaveBeenCalledWith(expect.objectContaining({
      codexBin: 'codex',
      codexHome,
      cwd: root,
      profile: 'default'
    }));
    expect(createHost.mock.calls[0]![0].builtInTools).toBeUndefined();
    const host = createHost.mock.results[0]!.value as CodexAppServerHost;
    expect(host.run).toHaveBeenCalledWith(expect.objectContaining({
      cwd: root,
      sandbox: 'workspace-write',
      prompt: expect.stringContaining('an original orange cat'),
      developerInstructions: expect.stringContaining('native image_generation')
    }));
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it('imports one new local artifact when Codex omits the structured savedPath notification', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const savedPath = join(codexHome, 'generated_images', 'thread-1', 'result.png');
    await mkdir(codexHome, { recursive: true });
    const createHost = fakeHost({
      emitImageItem: false,
      createArtifact: async () => {
        await mkdir(join(codexHome, 'generated_images', 'thread-1'), { recursive: true });
        await writeFile(savedPath, png);
      }
    });

    const result = await generateCodexNativeImage({
      prompt: 'an original orange cat',
      size: '1024x1024',
      quality: 'medium',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost
    });

    expect(result).toMatchObject({ content: png, mime: 'image/png', model: 'codex-native' });
  });

  it('imports one new artifact written directly under generated_images for older Codex layouts', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const savedPath = join(codexHome, 'generated_images', 'result.png');
    await mkdir(codexHome, { recursive: true });
    const createHost = fakeHost({
      emitImageItem: false,
      createArtifact: async () => {
        await mkdir(join(codexHome, 'generated_images'), { recursive: true });
        await writeFile(savedPath, png);
      }
    });

    const result = await generateCodexNativeImage({
      prompt: 'an original orange cat',
      size: '1024x1024',
      quality: 'medium',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost
    });

    expect(result).toMatchObject({ content: png, mime: 'image/png', model: 'codex-native' });
  });

  it('rejects ambiguous new local artifacts instead of guessing between them', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const generatedRoot = join(codexHome, 'generated_images', 'thread-1');
    await mkdir(codexHome, { recursive: true });
    const createHost = fakeHost({
      emitImageItem: false,
      createArtifact: async () => {
        await mkdir(generatedRoot, { recursive: true });
        await Promise.all([
          writeFile(join(generatedRoot, 'result-a.png'), png),
          writeFile(join(generatedRoot, 'result-b.png'), png)
        ]);
      }
    });

    await expect(generateCodexNativeImage({
      prompt: 'an original orange cat',
      size: '1024x1024',
      quality: 'medium',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost
    })).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('multiple')
    });
  });

  it('does not import an artifact created under another Codex thread', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const otherThreadRoot = join(codexHome, 'generated_images', 'thread-2');
    await mkdir(codexHome, { recursive: true });
    const createHost = fakeHost({
      emitImageItem: false,
      createArtifact: async () => {
        await mkdir(otherThreadRoot, { recursive: true });
        await writeFile(join(otherThreadRoot, 'result.png'), png);
      }
    });

    await expect(generateCodexNativeImage({
      prompt: 'an original orange cat',
      size: '1024x1024',
      quality: 'medium',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost
    })).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('new local image artifact')
    });
  });

  it('rejects an image artifact outside the workspace and Codex generated-images roots', async () => {
    const root = await tempRoot();
    const outside = join(root, 'outside.png');
    await mkdir(join(root, 'workspace'), { recursive: true });
    await mkdir(join(root, 'codex-home'), { recursive: true });
    await writeFile(outside, png);
    const createHost = fakeHost({ savedPath: outside });

    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: join(root, 'workspace'),
      codexBin: 'codex',
      codexHome: join(root, 'codex-home'),
      createHost
    })).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('rejects a missing or malformed savedPath instead of guessing an output', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'codex-home'), { recursive: true });
    for (const savedPath of [undefined, 'file:///C:/generated.png', join(root, 'missing.png')]) {
      const createHost = fakeHost({ savedPath });
      await expect(generateCodexNativeImage({
        prompt: 'cat',
        size: '1024x1024',
        quality: 'low',
        cwd: root,
        codexBin: 'codex',
        codexHome: join(root, 'codex-home'),
        createHost
      })).rejects.toBeInstanceOf(CodexNativeImageError);
    }
  });

  it('rejects bytes that are not a supported image signature', async () => {
    const root = await tempRoot();
    const savedPath = join(root, 'invalid.png');
    await mkdir(join(root, 'codex-home'), { recursive: true });
    await writeFile(savedPath, Buffer.from('not an image'));

    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome: join(root, 'codex-home'),
      createHost: fakeHost({ savedPath })
    })).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('rejects an artifact above the local size limit', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    const savedPath = join(root, 'oversized.png');
    await mkdir(codexHome, { recursive: true });
    await writeFile(savedPath, png);
    await truncate(savedPath, 30 * 1024 * 1024 + 1);

    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      createHost: fakeHost({ savedPath })
    })).rejects.toMatchObject({ code: 'upstream_error' });
  });

  it('turns a Codex image-generation failure into a local provider error', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'codex-home'), { recursive: true });
    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome: join(root, 'codex-home'),
      createHost: fakeHost({ failure: { message: 'native tool failed' } })
    })).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('native tool failed')
    });
  });

  it('rejects a turn that the Codex host reports as failed', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'codex-home'), { recursive: true });
    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome: join(root, 'codex-home'),
      createHost: fakeHost({ turnStatus: 'failed' })
    })).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('ended with status failed')
    });
  });

  it('cancels and closes the host when the local timeout is reached', async () => {
    const root = await tempRoot();
    await mkdir(join(root, 'codex-home'), { recursive: true });
    const createHost = fakeHost({ neverCompletes: true });
    await expect(generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome: join(root, 'codex-home'),
      timeoutMs: 5,
      createHost
    })).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('timed out')
    });
    const host = createHost.mock.results[0]!.value as CodexAppServerHost;
    const execution = (host.run as ReturnType<typeof vi.fn>).mock.results[0]!.value as {
      cancel: ReturnType<typeof vi.fn>;
    };
    expect(execution.cancel).toHaveBeenCalledTimes(1);
    expect(host.close).toHaveBeenCalledTimes(1);
  });

  it('cancels and closes the host when the caller aborts', async () => {
    const root = await tempRoot();
    const codexHome = join(root, 'codex-home');
    await mkdir(codexHome, { recursive: true });
    const controller = new AbortController();
    const createHost = fakeHost({ neverCompletes: true });
    const generation = generateCodexNativeImage({
      prompt: 'cat',
      size: '1024x1024',
      quality: 'low',
      cwd: root,
      codexBin: 'codex',
      codexHome,
      signal: controller.signal,
      createHost
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();

    await expect(generation).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('canceled')
    });
    const host = createHost.mock.results[0]!.value as CodexAppServerHost;
    const execution = (host.run as ReturnType<typeof vi.fn>).mock.results[0]!.value as {
      cancel: ReturnType<typeof vi.fn>;
    };
    expect(execution.cancel).toHaveBeenCalledTimes(1);
    expect(host.close).toHaveBeenCalledTimes(1);
  });
});

let testRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'opencreator-codex-native-'));
  testRoots.push(root);
  return root;
}

function fakeHost(input: {
  savedPath?: string;
  threadId?: string;
  failure?: { message: string };
  neverCompletes?: boolean;
  emitImageItem?: boolean;
  turnStatus?: CodexAppServerResult['turnStatus'];
  createArtifact?: () => Promise<void>;
}) {
  let host!: CodexAppServerHost;
  const createHost = vi.fn((hostInput: CodexAppServerHostInput) => {
    const run = vi.fn((turnInput: CodexAppServerTurnInput) => {
      const cancel = vi.fn();
      const result = input.neverCompletes
        ? new Promise<CodexAppServerResult>(() => undefined)
        : (async () => {
            await turnInput.onThreadStarted?.(input.threadId ?? 'thread-1');
            await input.createArtifact?.();
            if (input.emitImageItem !== false) {
              await turnInput.onNotification?.({
                method: 'item/completed',
                params: {
                  item: {
                    type: 'imageGeneration',
                    id: 'image-1',
                    status: input.failure === undefined ? 'completed' : 'failed',
                    result: '',
                    failure: input.failure ?? null,
                    ...(input.savedPath === undefined ? {} : { savedPath: input.savedPath })
                  }
                }
              });
            }
            return {
              ...completedResult,
              turnStatus: input.turnStatus ?? completedResult.turnStatus
            };
          })();
      return { cancel, result };
    });
    host = {
      pid: 123,
      started: Promise.resolve(123),
      run,
      isReusable: vi.fn(() => false),
      close: vi.fn(async () => undefined)
    };
    void hostInput;
    return host;
  });
  return createHost;
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
