import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCreatorRuntime } from '../scripts/creator-runtime-contract.mjs';
import {
  signCreatorRuntimeBundle,
  updateManifestHashes
} from '../scripts/sign-creator-runtime-after-pack.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('Creator Runtime Developer ID signing', () => {
  it('verifies the input, signs binaries and records their final hashes', async () => {
    const fixture = createFixture();
    const verifyRuntime = vi.fn(verifyCreatorRuntime);
    const signBinary = vi.fn(path => {
      writeFileSync(path, Buffer.concat([
        readFileSync(path),
        Buffer.from('-developer-id-signature')
      ]));
    });

    await signCreatorRuntimeBundle({
      electronPlatformName: 'darwin',
      appOutDir: fixture.appOutDir,
      packager: {
        appInfo: { productFilename: 'OpenCreator' },
        codeSigningInfo: {
          value: Promise.resolve({ keychainFile: '/tmp/release.keychain' })
        }
      }
    }, {
      env: {
        OPENCREATOR_APPLE_TEAM_ID: 'NVRH5R5DJ5',
        OPENCREATOR_DESKTOP_TARGET_ARCH: 'arm64'
      },
      findIdentity: () => (
        'Developer ID Application: Junxi YIN (NVRH5R5DJ5)'
      ),
      findBinaries: () => fixture.binaryPaths,
      signBinary,
      verifyRuntime
    });

    expect(verifyRuntime).toHaveBeenCalledTimes(2);
    expect(signBinary).toHaveBeenCalledTimes(fixture.binaryPaths.length);
    expect(signBinary).toHaveBeenCalledWith(
      fixture.binaryPaths[0],
      'Developer ID Application: Junxi YIN (NVRH5R5DJ5)',
      '/tmp/release.keychain'
    );
    expect(() => verifyCreatorRuntime(
      fixture.runtimeRoot,
      'darwin',
      'arm64'
    )).not.toThrow();
    const manifest = JSON.parse(readFileSync(
      join(fixture.runtimeRoot, 'manifest.json'),
      'utf8'
    ));
    for (const path of fixture.binaryPaths) {
      const relativePath = relative(fixture.runtimeRoot, path)
        .replaceAll('\\', '/');
      const resource = manifest.resources.find(
        candidate => candidate.path === relativePath
      );
      expect(resource.sha256).toBe(hashFile(path));
    }
  });

  it('rejects signed binaries that are absent from the manifest', () => {
    const fixture = createFixture();
    const undeclared = join(fixture.runtimeRoot, 'bin', 'undeclared');
    writeFileSync(undeclared, 'binary');

    expect(() => updateManifestHashes(
      fixture.runtimeRoot,
      [undeclared]
    )).toThrow(/absent from its manifest/i);
  });
});

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'opencreator-runtime-signing-'));
  temporaryDirectories.push(root);
  const appOutDir = join(root, 'mac-arm64');
  const runtimeRoot = join(
    appOutDir,
    'OpenCreator.app',
    'Contents',
    'Resources',
    'creator-runtime',
    'krillinai'
  );
  const files = {
    'bin/krillinai-cli': 'krillin',
    'bin/ffmpeg': 'ffmpeg',
    'bin/ffprobe': 'ffprobe',
    'bin/yt-dlp': 'yt-dlp',
    'build-record.json': '{"version":1}',
    'subtitle-style.json': '{"version":1}'
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(runtimeRoot, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  const resources = Object.keys(files).map(path => ({
    path,
    sha256: hashFile(join(runtimeRoot, path)),
    kind: path.startsWith('bin/') ? 'executable' : 'asset'
  }));
  const manifest = {
    version: 1,
    runtimeMode: 'cli',
    cliVersion: 'test',
    sourceCommit: 'test',
    sourceSha256: 'b'.repeat(64),
    integrationPatchSha256: 'a'.repeat(64),
    platform: 'darwin',
    arch: 'arm64',
    ytDlp: {
      mode: 'standalone',
      version: 'test',
      executable: 'bin/yt-dlp'
    },
    resources
  };
  writeFileSync(
    join(runtimeRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return {
    appOutDir,
    runtimeRoot,
    binaryPaths: [
      join(runtimeRoot, 'bin', 'krillinai-cli'),
      join(runtimeRoot, 'bin', 'ffmpeg'),
      join(runtimeRoot, 'bin', 'ffprobe'),
      join(runtimeRoot, 'bin', 'yt-dlp')
    ]
  };
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
