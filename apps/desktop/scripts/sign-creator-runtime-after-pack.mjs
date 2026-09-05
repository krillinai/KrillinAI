import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyCreatorRuntime } from './creator-runtime-contract.mjs';
import { findDeveloperIdIdentity } from './mac-signing.mjs';

const machOMagicValues = new Set([
  'feedface',
  'cefaedfe',
  'feedfacf',
  'cffaedfe',
  'cafebabe',
  'bebafeca',
  'cafebabf',
  'bfbafeca'
]);

export async function afterPack(context) {
  if (process.env.OPENCREATOR_SIGN_CREATOR_RUNTIME !== '1') return;
  await signCreatorRuntimeBundle(context);
}

export async function signCreatorRuntimeBundle(context, options = {}) {
  const env = options.env ?? process.env;
  if (context.electronPlatformName !== 'darwin') {
    throw new Error('Creator Runtime Developer ID signing requires macOS');
  }

  const teamId = env.OPENCREATOR_APPLE_TEAM_ID?.trim();
  const arch = env.OPENCREATOR_DESKTOP_TARGET_ARCH?.trim();
  if (!teamId || !['arm64', 'x64'].includes(arch)) {
    throw new Error(
      'Creator Runtime signing requires OPENCREATOR_APPLE_TEAM_ID and '
      + 'OPENCREATOR_DESKTOP_TARGET_ARCH'
    );
  }

  const productFilename = context.packager.appInfo.productFilename;
  const runtimeRoot = join(
    context.appOutDir,
    `${productFilename}.app`,
    'Contents',
    'Resources',
    'creator-runtime',
    'krillinai'
  );
  if (!existsSync(runtimeRoot)) {
    throw new Error(`Creator Runtime is missing from the app: ${runtimeRoot}`);
  }

  const verifyRuntime = options.verifyRuntime ?? verifyCreatorRuntime;
  verifyRuntime(runtimeRoot, 'darwin', arch);

  const signingInfo = await context.packager.codeSigningInfo.value;
  const keychainFile = signingInfo?.keychainFile ?? null;
  const findIdentity = options.findIdentity ?? findSigningIdentity;
  const identity = findIdentity(teamId, keychainFile);
  const findBinaries = options.findBinaries ?? findMachOBinaries;
  const binaries = findBinaries(runtimeRoot);
  if (binaries.length === 0) {
    throw new Error('Creator Runtime does not contain any Mach-O binaries');
  }

  const signBinary = options.signBinary ?? signMachOBinary;
  for (const path of binaries) {
    await signBinary(path, identity, keychainFile);
  }
  updateManifestHashes(runtimeRoot, binaries);
  verifyRuntime(runtimeRoot, 'darwin', arch);
  console.log(
    `[desktop-package] Signed ${binaries.length} Creator Runtime binaries`
  );
}

export function updateManifestHashes(runtimeRoot, signedPaths) {
  const manifestPath = join(runtimeRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const resources = new Map(
    manifest.resources.map(resource => [resource.path, resource])
  );
  for (const path of signedPaths) {
    const relativePath = relative(runtimeRoot, path).replaceAll('\\', '/');
    const resource = resources.get(relativePath);
    if (resource === undefined) {
      throw new Error(
        `Signed Creator Runtime binary is absent from its manifest: ${relativePath}`
      );
    }
    resource.sha256 = hashFile(path);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function findSigningIdentity(teamId, keychainFile) {
  return findDeveloperIdIdentity(
    teamId,
    () => listSigningIdentities(keychainFile)
  );
}

function listSigningIdentities(keychainFile) {
  const args = ['find-identity', '-v', '-p', 'codesigning'];
  if (keychainFile) args.push(keychainFile);
  const result = spawnSync('security', args, {
    encoding: 'utf8',
    timeout: 30_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect the macOS signing keychain: `
      + `${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function signMachOBinary(path, identity, keychainFile) {
  const args = [
    '--force',
    '--timestamp',
    '--options',
    'runtime',
    '--sign',
    identity
  ];
  if (keychainFile) args.push('--keychain', keychainFile);
  args.push(path);
  const result = spawnSync('codesign', args, {
    encoding: 'utf8',
    timeout: 5 * 60_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to sign Creator Runtime binary ${path}: `
      + `${result.stderr || result.stdout}`
    );
  }
}

function findMachOBinaries(root) {
  const binaries = [];
  visit(root);
  return binaries.sort((left, right) => {
    const depthDifference = right.split('/').length - left.split('/').length;
    return depthDifference || left.localeCompare(right);
  });

  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && isMachOBinary(path)) {
        binaries.push(path);
      }
    }
  }
}

function isMachOBinary(path) {
  if (!statSync(path).isFile()) return false;
  const descriptor = openSync(path, 'r');
  const header = Buffer.allocUnsafe(4);
  try {
    if (readSync(descriptor, header, 0, header.length, 0) < header.length) {
      return false;
    }
    return machOMagicValues.has(header.toString('hex'));
  } finally {
    closeSync(descriptor);
  }
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
