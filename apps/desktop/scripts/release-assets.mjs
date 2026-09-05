import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releasePlatforms = [
  { platform: 'darwin', arch: 'arm64', label: 'macOS Apple Silicon' },
  { platform: 'darwin', arch: 'x64', label: 'macOS Intel' },
  { platform: 'win32', arch: 'x64', label: 'Windows x64' }
];

export function releaseAssetNames(version, platform, arch) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  if (!releasePlatforms.some(target => target.platform === platform && target.arch === arch)) {
    throw new Error(`Unsupported release platform: ${platform}-${arch}`);
  }
  const prefix = `KrillinAI-${version}-${platform === 'darwin' ? 'mac' : 'win'}-${arch}`;
  if (platform === 'win32') return [`${prefix}.exe`, 'latest.yml'];
  return [
    `${prefix}.dmg`,
    `${prefix}.zip`,
    `${prefix}.zip.blockmap`,
    arch === 'x64' ? 'latest-x64-mac.yml' : 'latest-mac.yml'
  ];
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function stageReleaseAssets({ manifest, version, assetsDir }) {
  const names = releaseAssetNames(version, manifest.platform, manifest.arch);
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

function writeChecksums(directory, names) {
  const lines = [...names].sort().map(name => `${sha256(join(directory, name))}  ${name}`);
  writeFileSync(join(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
}

export function finalizeReleaseAssets({ directory, version, repository }) {
  const expected = releasePlatforms.flatMap(({ platform, arch }) => releaseAssetNames(version, platform, arch));
  const actual = readdirSync(directory, { withFileTypes: true });
  for (const entry of actual) {
    if (!entry.isFile() || (!expected.includes(entry.name) && entry.name !== 'SHA256SUMS.txt')) {
      throw new Error(`Unexpected public release asset: ${entry.name}`);
    }
  }
  for (const name of expected) {
    if (!actual.some(entry => entry.name === name)) throw new Error(`Missing release asset: ${name}`);
  }
  writeChecksums(directory, expected);
  const downloadRoot = `https://github.com/${repository}/releases/download/v${version}`;
  const rows = releasePlatforms.map(({ platform, arch, label }) => {
    const installer = releaseAssetNames(version, platform, arch)[0];
    return `| ${label} | [${installer}](${downloadRoot}/${installer}) |`;
  });
  return [
    `# KrillinAI v${version}`,
    '',
    '## 下载',
    '',
    '| 平台 | 安装包 |',
    '| --- | --- |',
    ...rows,
    '',
    `[SHA-256 校验清单](${downloadRoot}/SHA256SUMS.txt)`,
    '',
    'macOS 安装包已签名并公证。Windows 安装包暂未进行 Authenticode 签名，安装前可核对 SHA-256。',
    '',
    '<details>',
    '<summary>自动更新附件</summary>',
    '',
    'ZIP、ZIP blockmap 和 latest YAML 供客户端自动更新使用，手动安装只需下载上表对应的安装包。',
    '构建清单、调试配置和独立 CLI/Server 程序不作为桌面版下载附件发布。',
    '',
    '</details>',
    ''
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, tag, repository, notesPath] = process.argv.slice(2);
    if (!directory || !tag?.startsWith('v') || !repository || !notesPath) {
      throw new Error('Usage: node release-assets.mjs <assets-directory> <vVERSION> <owner/repo> <notes-file>');
    }
    const notes = finalizeReleaseAssets({ directory, version: tag.slice(1), repository });
    writeFileSync(notesPath, notes);
    console.log(`Verified ${readdirSync(directory).length} public release assets for ${tag}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
