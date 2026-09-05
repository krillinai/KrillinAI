import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finalizeReleaseAssets, releaseAssetNames, stageReleaseAssets } from '../scripts/release-assets.mjs';

const version = '3.0.0';
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(platform = 'darwin', arch = 'arm64') {
  const directory = mkdtempSync(join(tmpdir(), 'krillinai-release-assets-'));
  directories.push(directory);
  const assetsDir = join(directory, 'publish');
  const names = releaseAssetNames(version, platform, arch);
  const artifacts = names.map(name => {
    const path = join(directory, name);
    const content = Buffer.from(`verified content for ${name}`);
    writeFileSync(path, content);
    return { path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
  });
  return { directory, assetsDir, manifest: { platform, arch, artifacts } };
}

describe('Desktop release assets', () => {
  it('publishes only verified installers and required updater files, without stale assets', () => {
    const data = fixture();
    const extraNames = [
      'krillinai-cli-darwin-arm64', 'krillinai-build-manifest-darwin-arm64.json',
      'builder-effective-config.yaml', 'KrillinAI-3.0.0-mac-arm64.dmg.blockmap'
    ];
    for (const name of extraNames) {
      const path = join(data.directory, name);
      writeFileSync(path, 'internal');
      data.manifest.artifacts.push({ path });
    }
    mkdirSync(data.assetsDir);
    writeFileSync(join(data.assetsDir, 'old-version.dmg'), 'stale');
    stageReleaseAssets({ ...data, version });
    expect(readdirSync(data.assetsDir).sort()).toEqual([
      ...releaseAssetNames(version, 'darwin', 'arm64'), 'SHA256SUMS.txt'
    ].sort());
    expect(readFileSync(join(data.assetsDir, 'SHA256SUMS.txt'), 'utf8')).not.toMatch(/internal|manifest|old-version/);
  });

  it('rejects missing updater artifacts and modified package files before altering staged output', () => {
    const data = fixture('win32', 'x64');
    mkdirSync(data.assetsDir);
    writeFileSync(join(data.assetsDir, 'previous.exe'), 'preserved');
    const complete = [...data.manifest.artifacts];
    data.manifest.artifacts.pop();
    expect(() => stageReleaseAssets({ ...data, version })).toThrow('latest.yml');
    data.manifest.artifacts = complete;
    writeFileSync(complete[0].path, 'modified');
    expect(() => stageReleaseAssets({ ...data, version })).toThrow('changed after package verification');
    expect(readFileSync(join(data.assetsDir, 'previous.exe'), 'utf8')).toBe('preserved');
  });

  it('isolates macOS architectures and rejects unsupported targets or unsafe versions', () => {
    expect(releaseAssetNames(version, 'darwin', 'x64')).toContain('latest-x64-mac.yml');
    expect(releaseAssetNames(version, 'darwin', 'arm64')).toContain('latest-mac.yml');
    expect(() => releaseAssetNames(version, 'linux', 'x64')).toThrow('Unsupported');
    expect(() => releaseAssetNames('../3.0.0', 'win32', 'x64')).toThrow('Invalid release version');
  });

  it('finalizes 11 public assets with platform download links and checksums', () => {
    const data = fixture();
    for (const [platform, arch] of [['darwin', 'x64'], ['win32', 'x64']]) {
      for (const name of releaseAssetNames(version, platform, arch)) writeFileSync(join(data.directory, name), name);
    }
    const notes = finalizeReleaseAssets({ directory: data.directory, version, repository: 'krillinai/KrillinAI' });
    expect(readdirSync(data.directory)).toHaveLength(11);
    expect(readFileSync(join(data.directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')).toHaveLength(10);
    expect(notes).toContain('https://github.com/krillinai/KrillinAI/releases/download/v3.0.0/KrillinAI-3.0.0-win-x64.exe');
    expect(notes).toContain('macOS Apple Silicon');
    expect(notes).toContain('Authenticode');
    writeFileSync(join(data.directory, 'builder-debug.yml'), 'private diagnostic');
    expect(() => finalizeReleaseAssets({ directory: data.directory, version, repository: 'krillinai/KrillinAI' })).toThrow('Unexpected public release asset');
    rmSync(join(data.directory, 'builder-debug.yml'));
    rmSync(join(data.directory, 'latest.yml'));
    expect(() => finalizeReleaseAssets({ directory: data.directory, version, repository: 'krillinai/KrillinAI' })).toThrow('Missing release asset');
  });

  it('uses versioned platform filenames and the new repository for automatic updates', () => {
    const config = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8');
    expect(config).toContain('artifactName: KrillinAI-${version}-${os}-${arch}.${ext}');
    expect(config).toContain('repo: KrillinAI');
    expect(config).not.toContain('repo: OpenCreator');
  });
});
