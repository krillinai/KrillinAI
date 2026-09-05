import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { krillinReleaseAssetNames } from '../apps/desktop/scripts/release-assets.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(dirname(scriptPath), '..');

export function packageKrillinRelease(options = {}) {
  const rootDir = resolve(options.rootDir ?? defaultRootDir);
  const platform = normalizePlatform(
    options.platform
      ?? process.env.OPENCREATOR_KRILLINAI_TARGET_PLATFORM
      ?? process.platform
  );
  const arch = normalizeArch(
    options.arch
      ?? process.env.OPENCREATOR_KRILLINAI_TARGET_ARCH
      ?? process.arch
  );
  const version = options.version
    ?? process.env.OPENCREATOR_VERSION?.trim()
    ?? JSON.parse(
      readFileSync(join(rootDir, 'apps', 'desktop', 'package.json'), 'utf8')
    ).version;
  const target = `${platform}-${arch}`;
  const buildRoot = resolve(
    options.buildRoot
      ?? process.env.OPENCREATOR_KRILLINAI_BUILD_OUTPUT
      ?? join(rootDir, '.runtime', 'build', 'krillinai', target)
  );
  const outputDir = resolve(
    options.outputDir
      ?? process.env.OPENCREATOR_KRILLINAI_RELEASE_OUTPUT
      ?? join(rootDir, '.runtime', 'release', 'krillinai')
  );

  if (options.build !== false) {
    execFileSync(process.execPath, [join(rootDir, 'scripts', 'build-krillinai.mjs')], {
      cwd: rootDir,
      env: {
        ...process.env,
        OPENCREATOR_VERSION: version,
        OPENCREATOR_KRILLINAI_TARGET_PLATFORM: platform,
        OPENCREATOR_KRILLINAI_TARGET_ARCH: arch,
        OPENCREATOR_KRILLINAI_BUILD_OUTPUT: buildRoot
      },
      stdio: 'inherit'
    });
  }

  const manifest = readBuildManifest(buildRoot, version, platform, arch);
  const assetNames = krillinReleaseAssetNames(version, platform, arch);
  const specifications = [
    { assetName: assetNames[0], binaryName: 'krillinai-server' },
    { assetName: assetNames[1], binaryName: 'krillinai-cli' }
  ];
  const stagingRoot = mkdtempSync(join(tmpdir(), 'krillinai-release-'));
  mkdirSync(outputDir, { recursive: true });

  try {
    const assets = specifications.map(specification => {
      const binary = manifest.binaries[specification.binaryName];
      const source = resolve(buildRoot, binary.path);
      if (!existsSync(source) || !statSync(source).isFile()) {
        throw new Error(`KrillinAI release binary is missing: ${source}`);
      }
      if (hashFile(source) !== binary.sha256) {
        throw new Error(`KrillinAI release binary hash mismatch: ${source}`);
      }

      const packageName = stripArchiveExtension(specification.assetName);
      const packageRoot = join(stagingRoot, packageName);
      const executableSuffix = platform === 'win32' ? '.exe' : '';
      const executableName = `${specification.binaryName}${executableSuffix}`;
      mkdirSync(join(packageRoot, 'config'), { recursive: true });
      copyFileSync(source, join(packageRoot, executableName));
      if (platform !== 'win32') {
        chmodSync(join(packageRoot, executableName), 0o755);
      }
      copyRequiredFile(
        join(rootDir, 'runtime', 'krillinai', 'config', 'config-example.toml'),
        join(packageRoot, 'config', 'config-example.toml')
      );
      copyRequiredFile(
        join(rootDir, 'runtime', 'krillinai', 'config', 'subtitle-style-default.json'),
        join(packageRoot, 'config', 'subtitle-style-default.json')
      );
      copyRequiredFile(
        join(rootDir, 'runtime', 'krillinai', 'LICENSE'),
        join(packageRoot, 'LICENSE')
      );

      const archivePath = join(outputDir, specification.assetName);
      rmSync(archivePath, { force: true });
      createArchive({
        archivePath,
        packageName,
        stagingRoot,
        windowsZip: platform === 'win32'
      });
      if (!existsSync(archivePath) || statSync(archivePath).size === 0) {
        throw new Error(`KrillinAI release archive was not created: ${archivePath}`);
      }
      return archivePath;
    });

    if (process.env.GITHUB_ENV) {
      appendFileSync(
        process.env.GITHUB_ENV,
        `OPENCREATOR_KRILLINAI_RELEASE_ASSETS=${outputDir}\n`
      );
    }
    return {
      version,
      platform,
      arch,
      outputDir,
      assets: assets.map(path => ({
        path,
        name: basename(path),
        bytes: statSync(path).size,
        sha256: hashFile(path)
      }))
    };
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function readBuildManifest(buildRoot, version, platform, arch) {
  const path = join(buildRoot, 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(`KrillinAI build manifest is missing: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (
    manifest.version !== 1
    || manifest.component !== 'opencreator-krillinai'
    || manifest.componentVersion !== version
    || manifest.platform !== platform
    || manifest.arch !== arch
    || manifest.buildVcs !== false
  ) {
    throw new Error('KrillinAI build manifest does not match the release target');
  }
  for (const name of ['krillinai-server', 'krillinai-cli']) {
    const binary = manifest.binaries?.[name];
    if (
      typeof binary?.path !== 'string'
      || !/^[a-f0-9]{64}$/i.test(binary.sha256 ?? '')
    ) {
      throw new Error(`KrillinAI build manifest is missing ${name}`);
    }
  }
  return manifest;
}

function createArchive({ archivePath, packageName, stagingRoot, windowsZip }) {
  if (!windowsZip) {
    execFileSync('tar', ['-czf', archivePath, '-C', stagingRoot, packageName], {
      stdio: 'inherit'
    });
    return;
  }
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Compress-Archive -LiteralPath $env:KRILLIN_PACKAGE_SOURCE '
        + '-DestinationPath $env:KRILLIN_PACKAGE_ARCHIVE '
        + '-CompressionLevel Optimal -Force'
    ], {
      env: {
        ...process.env,
        KRILLIN_PACKAGE_SOURCE: join(stagingRoot, packageName),
        KRILLIN_PACKAGE_ARCHIVE: archivePath
      },
      stdio: 'inherit'
    });
    return;
  }
  execFileSync('zip', ['-q', '-r', archivePath, packageName], {
    cwd: stagingRoot,
    stdio: 'inherit'
  });
}

function copyRequiredFile(source, destination) {
  if (!existsSync(source) || !statSync(source).isFile()) {
    throw new Error(`KrillinAI release resource is missing: ${source}`);
  }
  copyFileSync(source, destination);
}

function stripArchiveExtension(name) {
  return name.endsWith('.tar.gz')
    ? name.slice(0, -'.tar.gz'.length)
    : name.slice(0, -'.zip'.length);
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalizePlatform(value) {
  if (value === 'mac') return 'darwin';
  if (value === 'win' || value === 'windows') return 'win32';
  if (['darwin', 'win32', 'linux'].includes(value)) return value;
  throw new Error(`Unsupported KrillinAI release platform: ${value}`);
}

function normalizeArch(value) {
  if (value === 'amd64') return 'x64';
  if (['x64', 'arm64'].includes(value)) return value;
  throw new Error(`Unsupported KrillinAI release architecture: ${value}`);
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === scriptPath;

if (invokedDirectly) {
  try {
    process.stdout.write(`${JSON.stringify(packageKrillinRelease())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
