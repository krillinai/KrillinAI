import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import type { KrillinRuntimeManifest } from '../../src/creator/krillin/manifest.js';
import { resolveYtDlpRuntime } from '../../src/creator/yt-dlp/runtime.js';

const resourceRoot = process.env.OPENCREATOR_CREATOR_RUNTIME_ROOT
  ?? fileURLToPath(new URL('../../../desktop/.pack/creator-runtime/krillinai', import.meta.url));
const manifestPath = resolve(resourceRoot, 'manifest.json');
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8')) as KrillinRuntimeManifest : undefined;
const runtime = manifest?.ytDlp?.mode === 'python'
  ? resolveYtDlpRuntime({ resourceRoot, manifest }) : undefined;

it.runIf(runtime !== undefined && existsSync(runtime.executable) && existsSync(runtime.script!))(
  'loads the Bilibili plugin and preserves media through real yt-dlp extraction with recorded response shapes',
  async () => {
    const { stderr } = await promisify(execFile)(runtime!.executable, [
      '-I', '-B', fileURLToPath(new URL('../fixtures/yt-dlp-bilibili-regression.py', import.meta.url)),
      runtime!.script!, fileURLToPath(new URL('../../runtime/yt-dlp', import.meta.url))
    ], { env: { ...process.env, ...runtime!.env }, timeout: 20_000 });
    expect(stderr).toContain('Ran 8 tests');
    expect(stderr).toMatch(/\bOK\b/);
  }, 25_000
);
