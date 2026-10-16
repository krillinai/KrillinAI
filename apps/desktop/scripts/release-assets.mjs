import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyEnglishReleaseNotes } from './verify-release-notes.mjs';

// Reuse the YAML parser already pinned by the Daemon workspace.
const { parse: parseYaml, stringify: stringifyYaml } = createRequire(
  new URL('../../daemon/package.json', import.meta.url)
)('yaml');

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const desktopDir = resolve(scriptDir, '..');

const releasePlatforms = [
  { platform: 'darwin', arch: 'arm64', label: 'macOS Apple Silicon' },
  { platform: 'darwin', arch: 'x64', label: 'macOS Intel' },
  { platform: 'win32', arch: 'x64', label: 'Windows x64' }
];

const krillinReleasePlatforms = [
  ...releasePlatforms,
  { platform: 'linux', arch: 'x64', label: 'Linux x64' },
  { platform: 'linux', arch: 'arm64', label: 'Linux ARM64' }
];

export function releaseAssetNames(version, platform, arch) {
  assertVersion(version);
  if (!releasePlatforms.some(target => target.platform === platform && target.arch === arch)) {
    throw new Error(`Unsupported release platform: ${platform}-${arch}`);
  }
  const prefix = `OpenCreator-${version}-${platform === 'darwin' ? 'mac' : 'win'}-${arch}`;
  if (platform === 'win32') return [`${prefix}.exe`, 'latest.yml'];
  return [
    `${prefix}.dmg`,
    `${prefix}.zip`,
    `${prefix}.zip.blockmap`,
    arch === 'x64' ? 'latest-x64-mac.yml' : 'latest-mac.yml'
  ];
}

export function krillinReleaseAssetNames(version, platform, arch) {
  assertVersion(version);
  if (!krillinReleasePlatforms.some(target => (
    target.platform === platform && target.arch === arch
  ))) {
    throw new Error(`Unsupported KrillinAI release platform: ${platform}-${arch}`);
  }
  const os = platform === 'darwin'
    ? 'mac'
    : platform === 'win32'
      ? 'win'
      : 'linux';
  const extension = platform === 'win32' ? 'zip' : 'tar.gz';
  return [
    `KrillinAI-Server-${version}-${os}-${arch}.${extension}`,
    `KrillinAI-CLI-${version}-${os}-${arch}.${extension}`
  ];
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function stageReleaseAssets({ manifest, version, assetsDir }) {
  const names = releaseAssetNames(version, manifest.platform, manifest.arch);
  if (manifest.remotionComponent) names.push(remotionReleaseAssetName(version, manifest.platform, manifest.arch));
  const selected = names.map(name => {
    const matches = manifest.artifacts.filter(artifact => basename(artifact.path) === name);
    if (matches.length !== 1) throw new Error(`Expected one verified release asset: ${name}`);
    const artifact = matches[0];
    if (statSync(artifact.path).size !== artifact.bytes || sha256(artifact.path) !== artifact.sha256) {
      throw new Error(`Release asset changed after package verification: ${name}`);
    }
    if (resolve(artifact.path) === resolve(assetsDir, name)) {
      throw new Error('Release staging directory must differ from build output');
    }
    return artifact;
  });

  // Only recreate the dedicated staging directory after all inputs are verified.
  rmSync(assetsDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });
  for (const artifact of selected) {
    copyFileSync(artifact.path, join(assetsDir, basename(artifact.path)));
  }
  writeChecksums(assetsDir, names);
  return [...names, 'SHA256SUMS.txt'];
}

export function remotionReleaseAssetName(version, platform, arch) {
  assertVersion(version);
  if (![...releasePlatforms, { platform: 'linux', arch: 'x64' }].some(target => target.platform === platform && target.arch === arch)) throw new Error(`Unsupported Remotion release platform: ${platform}-${arch}`);
  return `Remotion-${version}-${platform}-${arch}.tar.gz`;
}

function writeChecksums(directory, names) {
  const lines = [...names].sort().map(name => `${sha256(join(directory, name))}  ${name}`);
  writeFileSync(join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
}

export function refreshUpdaterMetadata({ directory, version }) {
  const updates = releasePlatforms.map(({ platform, arch }) => {
    const names = releaseAssetNames(version, platform, arch);
    const metadataName = names.find(name => name.endsWith('.yml'));
    const primaryName = names.find(name => name.endsWith(platform === 'darwin' ? '.zip' : '.exe'));
    const metadata = parseYaml(readFileSync(join(directory, metadataName), 'utf8'), {
      maxAliasCount: 0
    });
    if (metadata?.version !== version || metadata.path !== primaryName || !Array.isArray(metadata.files)) {
      throw new Error(`Invalid updater target or version: ${metadataName}`);
    }
    const allowed = names.filter(name => /\.(zip|dmg|exe)$/.test(name));
    const seen = new Set();
    for (const file of metadata.files) {
      if (!allowed.includes(file.url) || seen.has(file.url)) {
        throw new Error(`Unexpected updater file in ${metadataName}: ${file.url}`);
      }
      seen.add(file.url);
      const path = join(directory, file.url);
      const size = statSync(path).size;
      const sha512 = createHash('sha512').update(readFileSync(path)).digest('base64');
      // Stapling changes the DMG after Electron Builder writes its metadata.
      // The ZIP/EXE update payload must already match the verified candidate.
      if (!file.url.endsWith('.dmg') && (
        file.sha512 !== sha512 || (file.size !== undefined && file.size !== size)
      )) {
        throw new Error(`Updater payload does not match its candidate metadata: ${file.url}`);
      }
      file.sha512 = sha512;
      file.size = size;
      if (file.url === primaryName && metadata.sha512 !== sha512) {
        throw new Error(`Updater primary checksum is inconsistent: ${metadataName}`);
      }
    }
    if (!seen.has(primaryName)) throw new Error(`Missing updater payload: ${metadataName}`);
    return { path: join(directory, metadataName), metadata };
  });
  // Validate every platform before writing any derived metadata.
  for (const update of updates) {
    writeFileSync(update.path, stringifyYaml(update.metadata, { lineWidth: 0 }));
  }
}

export function verifyPublishedPayloads({ directory, assets }) {
  const names = readdirSync(directory).sort();
  if (JSON.stringify(assets.map(asset => asset.name).sort()) !== JSON.stringify(names)) {
    throw new Error('Published release asset list differs from the verified candidate');
  }
  const checksums = new Map(readFileSync(join(directory, 'SHA256SUMS.txt'), 'utf8')
    .trim().split('\n').map(line => [line.slice(66), `sha256:${line.slice(0, 64)}`]));
  for (const asset of assets) {
    if (asset.name === 'SHA256SUMS.txt' || asset.name.endsWith('.yml')) continue;
    if (asset.digest !== checksums.get(asset.name)) {
      throw new Error(`Published payload differs from the verified candidate: ${asset.name}`);
    }
  }
}

export function finalizeReleaseAssets({ directory, version, repository, highlights = '' }) {
  const notes = renderReleaseNotes({ version, repository, highlights });
  const desktopAssets = releasePlatforms.flatMap(
    ({ platform, arch }) => releaseAssetNames(version, platform, arch)
  );
  const krillinAssets = krillinReleasePlatforms.flatMap(
    ({ platform, arch }) => krillinReleaseAssetNames(version, platform, arch)
  );
  const remotionAssets = releasePlatforms.map(({ platform, arch }) => remotionReleaseAssetName(version, platform, arch));
  const expected = [...desktopAssets, ...krillinAssets, ...remotionAssets];
  const actual = readdirSync(directory, { withFileTypes: true });
  for (const entry of actual) {
    if (!entry.isFile() || (!expected.includes(entry.name) && entry.name !== 'SHA256SUMS.txt')) {
      throw new Error(`Unexpected public release asset: ${entry.name}`);
    }
  }
  for (const name of expected) {
    if (!actual.some(entry => entry.name === name)) throw new Error(`Missing release asset: ${name}`);
  }
  refreshUpdaterMetadata({ directory, version });
  writeChecksums(directory, expected);
  return notes;
}

export function renderReleaseNotes({ version, repository, highlights = '' }) {
  assertVersion(version);
  verifyEnglishReleaseNotes(highlights, `Release highlights for v${version}`);
  const downloadRoot = `https://github.com/${repository}/releases/download/v${version}`;
  const desktopRows = releasePlatforms.map(({ platform, arch, label }) => {
    const installer = releaseAssetNames(version, platform, arch)[0];
    return `| ${label} | [${installer}](${downloadRoot}/${installer}) |`;
  });
  const krillinRows = (assetIndex) => krillinReleasePlatforms.map(
    ({ platform, arch, label }) => {
      const asset = krillinReleaseAssetNames(version, platform, arch)[assetIndex];
      return `| ${label} | [${asset}](${downloadRoot}/${asset}) |`;
    }
  );
  const normalizedHighlights = highlights.trim();
  const notes = [
    `# OpenCreator v${version}`,
    '',
    normalizedHighlights,
    '',
    '## OpenCreator Desktop',
    '',
    '| Platform | Installer |',
    '| --- | --- |',
    ...desktopRows,
    '',
    '## KrillinAI Server',
    '',
    '| Platform | Server Binary |',
    '| --- | --- |',
    ...krillinRows(0),
    '',
    '## KrillinAI CLI',
    '',
    '| Platform | CLI Binary |',
    '| --- | --- |',
    ...krillinRows(1),
    '',
    '## Optional Rendering Components',
    '',
    'Remotion rendering components are downloaded on demand by OpenCreator. They are not included in the Desktop installer.',
    '',
    `[SHA-256 Checksums](${downloadRoot}/SHA256SUMS.txt)`,
    '',
    'The macOS installers are signed and notarized. The Windows installer is currently not Authenticode-signed; verify its SHA-256 checksum before installation.',
    '',
    '<details>',
    '<summary>Automatic Update Assets</summary>',
    '',
    'ZIP archives, ZIP blockmaps, and latest YAML files are used by the automatic updater. For manual installation, download only the installer listed above.',
    'Build manifests and debug configuration files are not included as public release assets.',
    '',
    '</details>',
    ''
  ].join('\n');
  verifyEnglishReleaseNotes(notes, `Release body for v${version}`);
  return notes;
}

function assertVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, tag, repository, notesPath, highlightsFile] = process.argv.slice(2);
    if (!directory || !tag?.startsWith('v') || !repository || !notesPath) {
      throw new Error('Usage: node release-assets.mjs <assets-directory> <vVERSION> <owner/repo> <notes-file> [highlights-file]');
    }
    const version = tag.slice(1);
    const highlightsPath = highlightsFile ?? resolve(desktopDir, 'release-notes', `${tag}.md`);
    const highlights = readFileSync(highlightsPath, 'utf8');
    const notes = finalizeReleaseAssets({ directory, version, repository, highlights });
    writeFileSync(notesPath, notes);
    console.log(`Verified ${readdirSync(directory).length} public release assets for ${tag}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
