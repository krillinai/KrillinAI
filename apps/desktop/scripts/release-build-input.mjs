import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function changedPaths(base, head, cwd = process.cwd()) {
  if (!base || /^0+$/.test(base)) return null;
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
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
