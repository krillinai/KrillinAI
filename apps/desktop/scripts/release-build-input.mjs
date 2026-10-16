import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDesktopReleaseTag } from './verify-desktop-release-tag.mjs';

const scriptPath = fileURLToPath(import.meta.url);

const releaseOnlyFiles = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/desktop-release.yml',
  '.codex/skills/oc-deploy/SKILL.md',
  '.codex/skills/oc-deploy/references/runbook.md',
  'apps/desktop/scripts/release-assets.mjs',
  'apps/desktop/scripts/release-build-input.mjs',
  'apps/desktop/test/release-assets.test.mjs',
  'apps/desktop/test/release-build-input.test.mjs',
  'apps/desktop/test/release-workflow.test.mjs',
  'docs/operations/opencreator-desktop-release-runbook.md',
  'docs/operations/opencreator-desktop-windows-release.md'
]);

export function isReleaseOnlyPath(path) {
  return releaseOnlyFiles.has(path) || path.startsWith('apps/desktop/release-notes/');
}

export function digestBuildEntries(entries) {
  const included = entries
    .filter(entry => !isReleaseOnlyPath(entry.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const hash = createHash('sha256');
  for (const entry of included) {
    hash.update(`${entry.mode} ${entry.type} ${entry.object}\t${entry.path}\n`);
  }
  return hash.digest('hex');
}

export function parseTreeEntries(output) {
  return output.split('\0').filter(Boolean).map(record => {
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/.exec(record);
    if (match === null) throw new Error(`Invalid git tree entry: ${record}`);
    return { mode: match[1], type: match[2], object: match[3], path: match[4] };
  });
}

export function buildInputDigest(ref = 'HEAD', cwd = process.cwd()) {
  const output = execFileSync(
    'git',
    ['ls-tree', '-r', '-z', '--full-tree', ref],
    { cwd, encoding: 'utf8' }
  );
  return digestBuildEntries(parseTreeEntries(output));
}

export function resolvePromotionTarget(tag, cwd = process.cwd()) {
  const { version } = JSON.parse(readFileSync(resolve(cwd, 'apps/desktop/package.json'), 'utf8'));
  if (!tag) throw new Error('An existing release tag is required for promotion');
  verifyDesktopReleaseTag(tag, version);
  const sha = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd, stdio: 'pipe' });
  if (buildInputDigest(sha, cwd) !== buildInputDigest('HEAD', cwd)) {
    throw new Error('Promotion requires identical application build inputs at the tag and workflow commit');
  }
  return { tag, sha };
}

export function changedPaths(base, head, cwd = process.cwd()) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd, stdio: 'ignore' });
  } catch (error) {
    if (error.status === 1 || error.status === 128) return null;
    throw error;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', base, head], { cwd, stdio: 'ignore' });
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '-z', base, head],
    { cwd, encoding: 'utf8' }
  );
  return output.split('\0').filter(Boolean);
}

export function changesAreReleaseOnly(paths) {
  return paths !== null && paths.length > 0 && paths.every(isReleaseOnlyPath);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const [command = 'digest', ...args] = process.argv.slice(2);
    if (command === 'digest') {
      console.log(buildInputDigest(args[0] ?? 'HEAD'));
    } else if (command === 'release-only') {
      if (args.length !== 2) throw new Error('release-only requires <base> <head>');
      console.log(changesAreReleaseOnly(changedPaths(args[0], args[1])) ? 'true' : 'false');
    } else if (command === 'promotion-target') {
      console.log(JSON.stringify(resolvePromotionTarget(args[0])));
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
