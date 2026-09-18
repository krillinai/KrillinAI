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
import { verifyStickmanRuntime } from '../scripts/stickman-runtime-contract.mjs';
import {
  signDaemonRuntimeBundle,
  signCreatorRuntimeBundle,
  signStickmanRuntimeBundle,
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

  it('signs the packaged Stickman browser and refreshes its manifest', async () => {
    const fixture = createStickmanFixture();
    const signBinary = vi.fn(path => {
      writeFileSync(path, Buffer.concat([
        readFileSync(path),
        Buffer.from('-developer-id-signature')
      ]));
    });

    await signStickmanRuntimeBundle(createContext(fixture.appOutDir), {
      env: signingEnv(),
      findIdentity: () => 'Developer ID Application: Junxi YIN (NVRH5R5DJ5)',
      findBinaries: () => fixture.binaryPaths,
      signBinary
    });

    expect(signBinary).toHaveBeenCalledTimes(fixture.binaryPaths.length);
    expect(() => verifyStickmanRuntime(
      fixture.runtimeRoot,
      'darwin',
      'arm64'
    )).not.toThrow();
  });

  it('signs native dependencies in the packaged Daemon', async () => {
    const root = mkdtempSync(join(tmpdir(), 'opencreator-daemon-signing-'));
    temporaryDirectories.push(root);
    const appOutDir = join(root, 'mac-arm64');
    const daemonRoot = join(
      appOutDir,
      'OpenCreator.app',
      'Contents',
      'Resources',
      'daemon'
    );
    const binaryPaths = [
      join(daemonRoot, 'node_modules', '@remotion', 'compositor', 'ffmpeg'),
      join(daemonRoot, 'node_modules', '@img', 'sharp', 'libvips.dylib')
    ];
    for (const path of binaryPaths) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'binary');
    }
    const signBinary = vi.fn();

    await signDaemonRuntimeBundle(createContext(appOutDir), {
      env: signingEnv(),
      findIdentity: () => 'Developer ID Application: Junxi YIN (NVRH5R5DJ5)',
      findBinaries: () => binaryPaths,
      signBinary
    });

    expect(signBinary).toHaveBeenCalledTimes(binaryPaths.length);
    expect(signBinary).toHaveBeenCalledWith(
      binaryPaths[0],
      'Developer ID Application: Junxi YIN (NVRH5R5DJ5)',
      '/tmp/release.keychain'
    );
  });
});

function createContext(appOutDir) {
  return {
    electronPlatformName: 'darwin',
    appOutDir,
    packager: {
      appInfo: { productFilename: 'OpenCreator' },
      codeSigningInfo: {
        value: Promise.resolve({ keychainFile: '/tmp/release.keychain' })
      }
    }
  };
}

function signingEnv() {
  return {
    OPENCREATOR_APPLE_TEAM_ID: 'NVRH5R5DJ5',
    OPENCREATOR_DESKTOP_TARGET_ARCH: 'arm64'
  };
}

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

function createStickmanFixture() {
  const root = mkdtempSync(join(tmpdir(), 'opencreator-stickman-signing-'));
  temporaryDirectories.push(root);
  const appOutDir = join(root, 'mac-arm64');
  const runtimeRoot = join(
    appOutDir,
    'OpenCreator.app',
    'Contents',
    'Resources',
    'stickman-runtime'
  );
  const files = {
    'bundle/site/index.html': '<html></html>',
    'browser/chrome-headless-shell': 'chromium',
    'fonts/NotoSans-Bold.woff2': 'font',
    'fonts/NotoSansSC-Bold.woff2': 'font',
    'fonts/OFL.txt': 'license',
    'visual-assets/catalog.json': '{}'
  };
  for (const character of [
    'default', 'tech-guy', 'long-hair', 'short-hair', 'hiphop',
    'student', 'elder', 'manager', 'chef', 'fitness'
  ]) {
    files[`characters/${character}.png`] = character;
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(runtimeRoot, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  const resources = Object.keys(files).map(path => ({
    path,
    kind: path.startsWith('browser/') ? 'browser'
      : path.startsWith('bundle/') ? 'bundle'
        : path.startsWith('fonts/') ? 'font'
          : path.startsWith('characters/') ? 'character'
            : 'visual-asset',
    sha256: hashFile(join(runtimeRoot, path)),
    bytes: readFileSync(join(runtimeRoot, path)).length,
    version: 'test',
    platform: 'darwin',
    arch: 'arm64'
  }));
  writeFileSync(join(runtimeRoot, 'manifest.json'), `${JSON.stringify({
    version: 1,
    platform: 'darwin',
    arch: 'arm64',
    remotionVersion: '4.0.473',
    chromiumVersion: '149.0.7790.0',
    bundlePath: 'bundle/site',
    browserExecutable: 'browser/chrome-headless-shell',
    resources
  }, null, 2)}\n`);
  return {
    appOutDir,
    runtimeRoot,
    binaryPaths: [join(runtimeRoot, 'browser', 'chrome-headless-shell')]
  };
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
