import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import {
  finalizeReleaseAssets,
  krillinReleaseAssetNames,
  releaseAssetNames,
  refreshUpdaterMetadata,
  verifyPublishedPayloads,
  remotionReleaseAssetName,
  stageReleaseAssets
} from '../scripts/release-assets.mjs';

const version = '3.0.0';
const directories = [];
const targets = [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']];
const { parse: parseYaml } = createRequire(new URL('../../daemon/package.json', import.meta.url))('yaml');

function updaterFixture(directory, platform, arch) {
  const names = releaseAssetNames(version, platform, arch);
  const files = names.filter(name => /\.(dmg|zip|exe)$/.test(name)).map(url => {
    const bytes = readFileSync(join(directory, url));
    return { url, sha512: createHash('sha512').update(bytes).digest('base64'), ...(platform === 'darwin' ? { size: bytes.length } : {}) };
  });
  const primary = files.find(file => file.url.endsWith(platform === 'darwin' ? '.zip' : '.exe'));
  writeFileSync(join(directory, names.find(name => name.endsWith('.yml'))), JSON.stringify({
    version, files, path: primary.url, sha512: primary.sha512, releaseDate: '2026-10-16T00:00:00.000Z'
  }));
}

function completeUpdaterFixtures(directory) {
  for (const [platform, arch] of targets) {
    for (const name of releaseAssetNames(version, platform, arch)) {
      writeFileSync(join(directory, name), `verified content for ${name}`);
    }
    updaterFixture(directory, platform, arch);
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture(platform = 'darwin', arch = 'arm64') {
  const directory = mkdtempSync(join(tmpdir(), 'opencreator-release-assets-'));
  directories.push(directory);
  const assetsDir = join(directory, 'publish');
  const names = releaseAssetNames(version, platform, arch);
  const artifacts = names.map(name => {
    const path = join(directory, name);
    const content = Buffer.from(`verified content for ${name}`);
    writeFileSync(path, content);
    return { path, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
  });
  updaterFixture(directory, platform, arch);
  for (const artifact of artifacts) {
    const bytes = readFileSync(artifact.path);
    artifact.bytes = bytes.length;
    artifact.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  return { directory, assetsDir, manifest: { platform, arch, artifacts } };
}

describe('Desktop release assets', () => {
  it('publishes only verified installers and required updater files, without stale assets', () => {
    const data = fixture();
    const extraNames = [
      'krillinai-cli-darwin-arm64', 'krillinai-build-manifest-darwin-arm64.json',
      'builder-effective-config.yaml', 'OpenCreator-3.0.0-mac-arm64.dmg.blockmap'
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
    expect(krillinReleaseAssetNames(version, 'linux', 'arm64')).toEqual([
      'KrillinAI-Server-3.0.0-linux-arm64.tar.gz',
      'KrillinAI-CLI-3.0.0-linux-arm64.tar.gz'
    ]);
    expect(krillinReleaseAssetNames(version, 'win32', 'x64')).toEqual([
      'KrillinAI-Server-3.0.0-win-x64.zip',
      'KrillinAI-CLI-3.0.0-win-x64.zip'
    ]);
    expect(() => krillinReleaseAssetNames(version, 'win32', 'arm64')).toThrow('Unsupported');
  });

  it('finalizes desktop, server, and CLI assets with download links and checksums', () => {
    const data = fixture();
    for (const [platform, arch] of [['darwin', 'x64'], ['win32', 'x64']]) {
      for (const name of releaseAssetNames(version, platform, arch)) writeFileSync(join(data.directory, name), name);
    }
    for (const [platform, arch] of targets) updaterFixture(data.directory, platform, arch);
    for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']]) {
      const name = remotionReleaseAssetName(version, platform, arch);
      writeFileSync(join(data.directory, name), name);
    }
    for (const [platform, arch] of [
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
      ['linux', 'x64'],
      ['linux', 'arm64']
    ]) {
      for (const name of krillinReleaseAssetNames(version, platform, arch)) {
        writeFileSync(join(data.directory, name), name);
      }
    }
    const notes = finalizeReleaseAssets({
      directory: data.directory,
      version,
      repository: 'krillinai/OpenCreator',
      highlights: '## What\'s New\n\n- Added Creator workflows.'
    });
    expect(readdirSync(data.directory)).toHaveLength(24);
    expect(readFileSync(join(data.directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')).toHaveLength(23);
    expect(notes).toContain('https://github.com/krillinai/OpenCreator/releases/download/v3.0.0/OpenCreator-3.0.0-win-x64.exe');
    expect(notes).toContain('KrillinAI-Server-3.0.0-linux-x64.tar.gz');
    expect(notes).toContain('KrillinAI-CLI-3.0.0-mac-arm64.tar.gz');
    expect(notes).toContain('macOS Apple Silicon');
    expect(notes).toContain('Authenticode');
    expect(notes).toContain('## What\'s New\n\n- Added Creator workflows.');
    expect(notes).toContain('## OpenCreator Desktop');
    expect(notes).toContain('| Platform | Installer |');
    expect(notes).toContain('[SHA-256 Checksums]');
    expect(notes).toContain('<summary>Automatic Update Assets</summary>');
    expect(notes).not.toMatch(/[\u3400-\u9fff]/u);
    const published = readdirSync(data.directory).map(name => ({ name, digest: `sha256:${createHash('sha256').update(readFileSync(join(data.directory, name))).digest('hex')}` }));
    expect(() => verifyPublishedPayloads({ directory: data.directory, assets: published })).not.toThrow();
    const installer = published.find(asset => asset.name.endsWith('.exe'));
    installer.digest = 'sha256:changed';
    expect(() => verifyPublishedPayloads({ directory: data.directory, assets: published })).toThrow('Published payload differs');
    expect(() => verifyPublishedPayloads({ directory: data.directory, assets: published.slice(1) })).toThrow('asset list differs');
    writeFileSync(join(data.directory, 'builder-debug.yml'), 'private diagnostic');
    expect(() => finalizeReleaseAssets({
      directory: data.directory,
      version,
      repository: 'krillinai/OpenCreator'
    })).toThrow('Unexpected public release asset');
    rmSync(join(data.directory, 'builder-debug.yml'));
    rmSync(join(data.directory, 'latest.yml'));
    expect(() => finalizeReleaseAssets({
      directory: data.directory,
      version,
      repository: 'krillinai/OpenCreator'
    })).toThrow('Missing release asset');
  });

  it('uses versioned platform filenames and the new repository for automatic updates', () => {
    const config = readFileSync(resolve(process.cwd(), 'electron-builder.yml'), 'utf8');
    expect(config).toContain('artifactName: OpenCreator-${version}-${os}-${arch}.${ext}');
    expect(config).toContain('repo: OpenCreator');
    expect(config).not.toContain('repo: KrillinAI');
  });

  it('runs the release finalizer through the same CLI used by the promotion workflow', () => {
    const data = fixture();
    for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']]) {
      const name = remotionReleaseAssetName(version, platform, arch);
      writeFileSync(join(data.directory, name), name);
    }
    for (const [platform, arch] of [['darwin', 'x64'], ['win32', 'x64']]) {
      for (const name of releaseAssetNames(version, platform, arch)) {
        writeFileSync(join(data.directory, name), name);
      }
    }
    for (const [platform, arch] of targets) updaterFixture(data.directory, platform, arch);
    for (const [platform, arch] of [
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['win32', 'x64'],
      ['linux', 'x64'],
      ['linux', 'arm64']
    ]) {
      for (const name of krillinReleaseAssetNames(version, platform, arch)) {
        writeFileSync(join(data.directory, name), name);
      }
    }
    const notesPath = join(data.directory, '..', 'release-notes.md');
    const result = spawnSync(process.execPath, [
      resolve(process.cwd(), 'scripts/release-assets.mjs'),
      data.directory,
      `v${version}`,
      'krillinai/OpenCreator',
      notesPath
    ], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Verified 24 public release assets for v${version}`);
    expect(readFileSync(notesPath, 'utf8')).toContain(`# OpenCreator v${version}`);
    rmSync(notesPath);
  });
});

describe('Updater metadata after notarization', () => {
  it('refreshes stapled DMG checksums and sizes while retaining the update payload identity', () => {
    const { directory } = fixture();
    completeUpdaterFixtures(directory);
    const before = parseYaml(readFileSync(join(directory, 'latest-mac.yml'), 'utf8'));
    const dmgName = releaseAssetNames(version, 'darwin', 'arm64')[0];
    writeFileSync(join(directory, dmgName), 'signed DMG with its stapled ticket');
    refreshUpdaterMetadata({ directory, version });
    const after = parseYaml(readFileSync(join(directory, 'latest-mac.yml'), 'utf8'));
    const dmg = after.files.find(file => file.url === dmgName);
    const bytes = readFileSync(join(directory, dmgName));
    expect(dmg.size).toBe(bytes.length);
    expect(dmg.sha512).toBe(createHash('sha512').update(bytes).digest('base64'));
    expect(after.path).toBe(before.path);
    expect(after.sha512).toBe(before.sha512);
    expect(after.files.find(file => file.url === before.path)).toEqual(before.files.find(file => file.url === before.path));
    const windows = parseYaml(readFileSync(join(directory, 'latest.yml'), 'utf8'));
    expect(windows.files[0].size).toBe(readFileSync(join(directory, windows.path)).length);
  });

  it.each(['payload', 'primary-checksum', 'architecture', 'unsafe-url'])('rejects inconsistent %s before modifying any metadata', problem => {
    const { directory } = fixture();
    completeUpdaterFixtures(directory);
    const path = join(directory, 'latest-x64-mac.yml');
    const metadata = parseYaml(readFileSync(path, 'utf8'));
    if (problem === 'payload') writeFileSync(join(directory, metadata.path), 'changed ZIP');
    if (problem === 'primary-checksum') metadata.sha512 = 'incorrect';
    if (problem === 'architecture') metadata.path = `OpenCreator-${version}-mac-arm64.zip`;
    if (problem === 'unsafe-url') metadata.files[0].url = '../unverified.dmg';
    writeFileSync(path, JSON.stringify(metadata));
    const before = targets.map(([platform, arch]) => readFileSync(join(directory, releaseAssetNames(version, platform, arch).find(name => name.endsWith('.yml'))), 'utf8'));
    expect(() => refreshUpdaterMetadata({ directory, version })).toThrow();
    const after = targets.map(([platform, arch]) => readFileSync(join(directory, releaseAssetNames(version, platform, arch).find(name => name.endsWith('.yml'))), 'utf8'));
    expect(after).toEqual(before);
  });
});
