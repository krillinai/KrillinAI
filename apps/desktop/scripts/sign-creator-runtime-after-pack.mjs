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
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyCreatorRuntime } from './creator-runtime-contract.mjs';
import { verifyStickmanRuntime } from './stickman-runtime-contract.mjs';
import { findDeveloperIdIdentity, withMacSigningKeychain } from './mac-signing.mjs';
import { prepareMacAppIcon } from './mac-app-icon.mjs';

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

const remotionBrowserEntitlements = fileURLToPath(
  new URL('../resources/entitlements.mac.plist', import.meta.url)
);

export async function afterPack(context) {
  await prepareMacAppIcon(context);
  if (process.env.OPENCREATOR_SIGN_CREATOR_RUNTIME !== '1') return;
  await signDaemonRuntimeBundle(context);
  await signCreatorRuntimeBundle(context);
}

export async function signRemotionComponent(runtimeRoot, env = process.env, options = {}) {
  if (env.OPENCREATOR_SIGN_CREATOR_RUNTIME !== '1') return;
  if ((options.platform ?? process.platform) !== 'darwin') throw new Error('Remotion Developer ID signing requires macOS');
  await (options.withKeychain ?? withMacSigningKeychain)(env, async signingEnv => {
    const keychainFile = signingEnv.APPLE_KEYCHAIN ?? null;
    const identity = signingEnv.OPENCREATOR_REMOTION_SIGNING_IDENTITY?.trim()
      || (options.findIdentity ?? findSigningIdentity)(signingEnv.OPENCREATOR_APPLE_TEAM_ID, keychainFile);
    const binaries = (options.findBinaries ?? findMachOBinaries)(runtimeRoot);
    if (binaries.length === 0) throw new Error('Remotion component has no native binaries');
    const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'manifest.json'), 'utf8'));
    const browserExecutable = resolve(runtimeRoot, manifest.browserExecutable);
    const signBinary = options.signBinary ?? signMachOBinary;
    for (const path of binaries) {
      // Chromium's V8 needs JIT permissions when hardened runtime is enabled.
      // Keep these permissions scoped to the browser executable.
      if (resolve(path) === browserExecutable) {
        await signBinary(path, identity, keychainFile, remotionBrowserEntitlements);
      } else {
        await signBinary(path, identity, keychainFile);
      }
    }
    updateManifestHashes(runtimeRoot, binaries);
  });
}

export async function signDaemonRuntimeBundle(context, options = {}) {
  return signPackagedRuntime(context, options, {
    name: 'Daemon Runtime',
    relativeRoot: ['daemon'],
    verifyRuntime: () => undefined,
    updateManifest: false
  });
}

export async function signCreatorRuntimeBundle(context, options = {}) {
  return signPackagedRuntime(context, options, {
    name: 'Creator Runtime',
    relativeRoot: ['creator-runtime', 'krillinai'],
    verifyRuntime: options.verifyRuntime ?? verifyCreatorRuntime
  });
}

export async function signStickmanRuntimeBundle(context, options = {}) {
  return signPackagedRuntime(context, options, {
    name: 'Stickman Runtime',
    relativeRoot: ['stickman-runtime'],
    verifyRuntime: options.verifyRuntime ?? verifyStickmanRuntime
  });
}

async function signPackagedRuntime(context, options, runtime) {
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
    ...runtime.relativeRoot
  );
  if (!existsSync(runtimeRoot)) {
    throw new Error(`${runtime.name} is missing from the app: ${runtimeRoot}`);
  }

  const verifyRuntime = runtime.verifyRuntime;
  verifyRuntime(runtimeRoot, 'darwin', arch);

  const signingInfo = await context.packager.codeSigningInfo.value;
  const keychainFile = signingInfo?.keychainFile ?? null;
  const findIdentity = options.findIdentity ?? findSigningIdentity;
  const identity = findIdentity(teamId, keychainFile);
  const findBinaries = options.findBinaries ?? findMachOBinaries;
  const binaries = findBinaries(runtimeRoot);
  if (binaries.length === 0) {
    throw new Error(`${runtime.name} does not contain any Mach-O binaries`);
  }

  const signBinary = options.signBinary ?? signMachOBinary;
  for (const path of binaries) {
    await signBinary(path, identity, keychainFile);
  }
  if (runtime.updateManifest !== false) {
    updateManifestHashes(runtimeRoot, binaries);
  }
  verifyRuntime(runtimeRoot, 'darwin', arch);
  console.log(
    `[desktop-package] Signed ${binaries.length} ${runtime.name} binaries`
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
    if (Number.isSafeInteger(resource.bytes)) {
      resource.bytes = statSync(path).size;
    }
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

function signMachOBinary(path, identity, keychainFile, entitlementsPath) {
  const args = [
    '--force',
    '--timestamp',
    '--options',
    'runtime',
    '--sign',
    identity
  ];
  if (keychainFile) args.push('--keychain', keychainFile);
  if (entitlementsPath) args.push('--entitlements', entitlementsPath);
  args.push(path);
  const result = spawnSync('codesign', args, {
    encoding: 'utf8',
    timeout: 5 * 60_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to sign packaged runtime binary ${path}: `
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
