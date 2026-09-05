import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { creatorRuntimeReleases } from '../scripts/creator-runtime-releases.mjs';
import { prepareElectronBuilderCache } from '../scripts/electron-builder-cache.mjs';
import { verifyRuntimeExecutable } from '../scripts/runtime-executable-check.mjs';

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('Desktop release runtime regressions', () => {
  it('installs a locked hoisted Daemon dependency tree for portable packages', () => {
    const prepareSource = readFileSync(
      new URL('../scripts/prepare-daemon.mjs', import.meta.url),
      'utf8'
    );
    const runtimePackage = JSON.parse(readFileSync(
      new URL('../packaging/daemon-runtime/package.json', import.meta.url),
      'utf8'
    ));
    const builderConfig = readFileSync(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    );

    expect(prepareSource).toContain("'--config.node-linker=hoisted'");
    expect(prepareSource).toContain('assertPortableDependencyTree();');
    expect(runtimePackage.dependencies).toMatchObject({
      'cross-spawn': '7.0.6',
      fastify: '5.9.0'
    });
    expect(runtimePackage.dependencies).not.toHaveProperty('which');
    expect(builderConfig).toContain('differentialPackage: false');
    expect(builderConfig).toContain('useZip: true');
  });

  it('pins the distinct Intel macOS FFmpeg build version', () => {
    const releases = creatorRuntimeReleases();
    expect(releases['darwin-arm64'].ffmpeg.version).toBe('6.0');
    expect(releases['darwin-x64'].ffmpeg.version).toBe('6.1.1');
    expect(releases['win32-x64'].ffmpeg.version).toBe('6.1.1');
    expect(releases['darwin-x64'].ffmpeg.expected.test(
      'ffmpeg version 6.1.1-tessus Copyright (c) the FFmpeg developers'
    )).toBe(true);
    expect(releases['darwin-x64'].ffprobe.expected.test(
      'ffprobe version 6.1.1-tessus Copyright (c) the FFmpeg developers'
    )).toBe(true);
    expect(releases['win32-x64'].ffmpeg.expected.test(
      'ffmpeg version 6.1.1-essentials_build-www.gyan.dev Copyright'
    )).toBe(true);
  });

  it('reports executable output when a runtime version check fails', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-runtime-check-test-'));
    const executable = join(root, 'runtime-check.cjs');
    writeFileSync(
      executable,
      'console.log("ffmpeg version 8.0"); console.error("details");\n'
    );
    expect(() => verifyRuntimeExecutable({
      name: 'ffmpeg',
      path: process.execPath,
      args: [executable],
      expected: /^ffmpeg version 6\.0/m,
      env: process.env
    })).toThrow(/stdout=.*ffmpeg version 8\.0.*stderr=.*details/);
  });

  it('keeps downloaded electron-builder tools in CommonJS scope', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-builder-cache-test-'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n');
    const cache = join(root, '.cache', 'electron-builder');
    prepareElectronBuilderCache(cache);
    const tool = join(cache, 'icons@1.1.0', 'bundle', 'icon-tool.js');
    mkdirSync(dirname(tool), { recursive: true });
    writeFileSync(tool, 'const path = require("node:path"); console.log(path.basename(__filename));\n');

    const result = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('icon-tool.js');
    expect(JSON.parse(readFileSync(join(cache, 'package.json'), 'utf8'))).toMatchObject({
      private: true,
      type: 'commonjs'
    });
  });

  it('uses a native Codex executable in the Windows packaged Creator E2E', () => {
    const source = readFileSync(
      new URL('../e2e/creator-packaged-app.spec.ts', import.meta.url),
      'utf8'
    );
    expect(source).toContain("join(binDir, 'codex.exe')");
    expect(source).toContain("join(cacheDir, 'fake-codex-launcher.exe')");
    expect(source).toContain('OPENCREATOR_E2E_NODE_BINARY: process.execPath');
    expect(source).toContain('OPENCREATOR_E2E_FAKE_CODEX_SCRIPT: fakeCodexScript');
    expect(source).not.toContain("join(binDir, 'codex.cmd')");
  });

  it('uses a native yt-dlp executable in the Windows packaged Creator E2E', () => {
    const source = readFileSync(
      new URL('../e2e/creator-packaged-app.spec.ts', import.meta.url),
      'utf8'
    );
    expect(source).toContain("join(binDir, 'yt-dlp.exe')");
    expect(source).toContain("join(cacheDir, 'fake-yt-dlp-launcher.exe')");
    expect(source).toContain(
      'OPENCREATOR_E2E_FAKE_YT_DLP_SCRIPT: fakeYtDlpScript'
    );
    expect(source).not.toContain("join(binDir, 'yt-dlp.cmd')");
  });
});
