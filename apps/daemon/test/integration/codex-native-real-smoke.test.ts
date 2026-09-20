import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodexHome } from '../../src/codex/home.js';
import { generateCodexNativeImage } from '../../src/image-generation/codex-native.js';

const runRealSmoke = process.env.OPENCREATOR_RUN_CODEX_NATIVE_SMOKE === '1';

(runRealSmoke ? describe : describe.skip)('Codex native real subscription smoke', () => {
  it('generates one local image through the authenticated Codex session', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'opencreator-codex-native-real-'));
    try {
      const result = await generateCodexNativeImage({
        prompt: 'An original orange cat sitting beside a sunny window, simple composition',
        size: '1024x1024',
        quality: 'low',
        cwd,
        codexBin: process.env.OPENCREATOR_CODEX_BIN ?? 'codex',
        codexHome: resolveCodexHome().path,
        timeoutMs: 240_000
      });

      expect(result.model).toBe('codex-native');
      expect(result.content.length).toBeGreaterThan(0);
      expect(['image/png', 'image/jpeg', 'image/webp']).toContain(result.mime);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 300_000);
});
