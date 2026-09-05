import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageKrillinRelease } from '../../../scripts/package-krillinai-release.mjs';

const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('KrillinAI release packages', () => {
  it('creates separate Server and CLI archives with only their own executable', () => {
    const fixture = createFixture();
    const result = packageKrillinRelease({
      rootDir: fixture.root,
      buildRoot: fixture.buildRoot,
      outputDir: fixture.outputDir,
      version: '3.0.0',
      platform: 'darwin',
      arch: 'arm64',
      build: false
    });

    expect(result.assets.map(asset => asset.name)).toEqual([
      'KrillinAI-Server-3.0.0-mac-arm64.tar.gz',
      'KrillinAI-CLI-3.0.0-mac-arm64.tar.gz'
    ]);
    const serverFiles = archiveFiles(result.assets[0].path);
    const cliFiles = archiveFiles(result.assets[1].path);
    expect(serverFiles).toContain(
      'KrillinAI-Server-3.0.0-mac-arm64/krillinai-server'
    );
    expect(serverFiles).not.toContain(
      'KrillinAI-Server-3.0.0-mac-arm64/krillinai-cli'
    );
    expect(cliFiles).toContain(
      'KrillinAI-CLI-3.0.0-mac-arm64/krillinai-cli'
    );
    expect(cliFiles).not.toContain(
      'KrillinAI-CLI-3.0.0-mac-arm64/krillinai-server'
    );
    for (const files of [serverFiles, cliFiles]) {
      expect(files.some(path => path.endsWith('/config/config-example.toml'))).toBe(true);
      expect(files.some(path => path.endsWith('/config/subtitle-style-default.json'))).toBe(true);
      expect(files.some(path => path.endsWith('/LICENSE'))).toBe(true);
    }
  });

  it('rejects binaries that changed after the build manifest was written', () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.buildRoot, 'bin', 'krillinai-cli'), 'modified');
    expect(() => packageKrillinRelease({
      rootDir: fixture.root,
      buildRoot: fixture.buildRoot,
      outputDir: fixture.outputDir,
      version: '3.0.0',
      platform: 'darwin',
      arch: 'arm64',
      build: false
    })).toThrow('hash mismatch');
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'krillinai-package-fixture-'));
  directories.push(root);
  const buildRoot = join(root, 'build');
  const outputDir = join(root, 'release');
  const configDir = join(root, 'runtime', 'krillinai', 'config');
  const binDir = join(buildRoot, 'bin');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(configDir, 'config-example.toml'), '[server]\nport = 8888\n');
  writeFileSync(join(configDir, 'subtitle-style-default.json'), '{"version":1}\n');
  writeFileSync(join(root, 'runtime', 'krillinai', 'LICENSE'), 'license\n');
  const binaries = {};
  for (const name of ['krillinai-server', 'krillinai-cli']) {
    const path = join(binDir, name);
    writeFileSync(path, `${name}\n`);
    binaries[name] = {
      path: `bin/${name}`,
      sha256: hashFile(path)
    };
  }
  writeFileSync(join(buildRoot, 'manifest.json'), JSON.stringify({
    version: 1,
    component: 'opencreator-krillinai',
    componentVersion: '3.0.0',
    platform: 'darwin',
    arch: 'arm64',
    buildVcs: false,
    binaries
  }));
  return { root, buildRoot, outputDir };
}

function archiveFiles(path) {
  return execFileSync('tar', ['-tzf', path], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
