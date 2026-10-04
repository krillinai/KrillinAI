import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const DEFAULT_OPENCREATOR_APPLE_TEAM_ID = 'NVRH5R5DJ5';
export const DEFAULT_NOTARY_KEYCHAIN_PROFILE = 'clawee-notary';

// Prepare one keychain before standalone component signing and keep it alive
// through Electron Builder. CSC_KEYCHAIN avoids a second certificate import.
export async function withMacSigningKeychain(env, action, options = {}) {
  const existingKeychain = env.APPLE_KEYCHAIN?.trim() || env.CSC_KEYCHAIN?.trim();
  if (existingKeychain) return action(signingEnvironment(env, existingKeychain));
  if (!hasValue(env.CSC_LINK)) return action(env);
  if (!hasValue(env.CSC_KEY_PASSWORD)) {
    throw new Error('Temporary macOS signing requires CSC_KEY_PASSWORD with CSC_LINK');
  }

  const tools = options.keychainTools ?? loadKeychainTools();
  const temporaryFiles = new tools.TmpDir();
  const currentDir = mkdtempSync(join(tmpdir(), 'opencreator-component-signing-'));
  const keychainFile = join(currentDir, 'signing.keychain');
  const keychainPassword = randomBytes(32).toString('hex');
  const security = options.runSecurity ?? (args => runSecurity(args, [
    env.CSC_LINK, env.CSC_KEY_PASSWORD, keychainPassword
  ]));
  const listKeychains = async () => (await security(['list-keychains', '-d', 'user']))
    .split('\n').map(line => line.trim().replace(/^"|"$/g, '')).filter(Boolean);
  let keychainCreated = false;
  let addedKeychains = [];
  try {
    let certificate;
    try { certificate = await tools.importCertificate(env.CSC_LINK, temporaryFiles, currentDir); }
    catch { throw new Error('Unable to prepare the macOS signing certificate from CSC_LINK'); }
    await security(['create-keychain', '-p', keychainPassword, keychainFile]);
    keychainCreated = true;
    await security(['unlock-keychain', '-p', keychainPassword, keychainFile]);
    await security(['set-keychain-settings', '-lut', '21600', keychainFile]);
    const currentKeychains = await listKeychains();
    addedKeychains = [keychainFile, tools.rootCertKeychain].filter(path => path && !currentKeychains.includes(path));
    await security(['list-keychains', '-d', 'user', '-s', ...addedKeychains, ...currentKeychains]);
    await security(['import', certificate, '-k', keychainFile,
      '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild', '-P', env.CSC_KEY_PASSWORD]);
    // This password belongs to the keychain, not the imported PKCS#12 file.
    await security(['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', keychainPassword, keychainFile]);
    return await action(signingEnvironment(env, keychainFile));
  } finally {
    try {
      if (addedKeychains.length > 0) {
        const currentKeychains = await listKeychains();
        await security(['list-keychains', '-d', 'user', '-s', ...currentKeychains.filter(path => !addedKeychains.includes(path))]);
      }
    } finally {
      try {
        if (keychainCreated || existsSync(keychainFile) || existsSync(`${keychainFile}-db`)) {
          await security(['delete-keychain', keychainFile]);
        }
      }
      finally {
        try { await temporaryFiles.cleanup(); }
        finally { rmSync(currentDir, { recursive: true, force: true }); }
      }
    }
  }
}

function signingEnvironment(env, keychainFile) {
  const result = { ...env, APPLE_KEYCHAIN: keychainFile, CSC_KEYCHAIN: keychainFile };
  delete result.CSC_LINK;
  delete result.CSC_KEY_PASSWORD;
  return result;
}

function runSecurity(args, secrets) {
  const result = spawnSync('/usr/bin/security', args, { encoding: 'utf8', timeout: 60_000 });
  if (result.error || result.status !== 0) {
    let detail = result.stderr?.trim() || result.error?.message || 'No diagnostic output';
    for (const secret of secrets) if (secret) detail = detail.replaceAll(secret, '[redacted]');
    throw new Error(`macOS signing: security ${args[0]} failed (${result.status ?? 'process error'}): ${detail}`);
  }
  return result.stdout;
}

function loadKeychainTools() {
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve('electron-builder'));
  const signingPath = builderRequire.resolve('app-builder-lib/out/codeSign/codesign.js');
  const signingRequire = createRequire(signingPath);
  return {
    ...signingRequire(signingPath),
    TmpDir: signingRequire('builder-util').TmpDir,
    rootCertKeychain: resolve(dirname(signingPath), '../../certs/root_certs.keychain')
  };
}

export function configureMacDirectorySigning(input) {
  const builderEnv = { ...input.env };

  if (input.platform !== 'darwin') {
    if (input.signed) {
      throw new Error('Developer ID directory signing is only supported on macOS');
    }
    return {
      args: [],
      builderEnv,
      mode: 'not-applicable',
      teamId: undefined
    };
  }

  if (!input.signed) {
    builderEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    return {
      args: [
        '--config.mac.identity=null',
        '--config.mac.notarize=false'
      ],
      builderEnv,
      mode: 'adhoc',
      teamId: undefined,
      identity: undefined
    };
  }

  const teamId = input.teamId?.trim()
    || DEFAULT_OPENCREATOR_APPLE_TEAM_ID;
  const identity = findDeveloperIdIdentity(teamId, input.findIdentities);
  builderEnv.CSC_NAME = identity.replace(
    /^Developer ID Application:\s*/,
    ''
  );

  return {
    args: ['--config.mac.notarize=false'],
    builderEnv,
    mode: 'developer-id',
    teamId,
    identity
  };
}

export function configureMacReleaseSigning(input) {
  if (input.platform !== 'darwin') {
    throw new Error('Developer ID release signing is only supported on macOS');
  }

  const builderEnv = { ...input.env };
  const teamId = input.teamId?.trim()
    || DEFAULT_OPENCREATOR_APPLE_TEAM_ID;
  let identity;

  if (hasValue(builderEnv.CSC_LINK)) {
    if (!hasValue(builderEnv.CSC_KEY_PASSWORD)) {
      throw new Error(
        'Formal macOS releases require CSC_KEY_PASSWORD with CSC_LINK'
      );
    }
  } else {
    identity = findDeveloperIdIdentity(teamId, input.findIdentities);
    builderEnv.CSC_NAME = identity.replace(
      /^Developer ID Application:\s*/,
      ''
    );
  }

  const notarization = resolveNotarizationCredentials(builderEnv, teamId);
  if (notarization.profile !== undefined) {
    (input.validateNotaryProfile ?? validateNotaryKeychainProfile)(
      notarization.profile,
      builderEnv.APPLE_KEYCHAIN
    );
    builderEnv.APPLE_KEYCHAIN_PROFILE = notarization.profile;
  }

  return {
    args: [],
    builderEnv,
    mode: 'developer-id',
    teamId,
    identity,
    notarizationArgs: notarization.args
  };
}

export function resolveNotarizationCredentials(
  env,
  teamId = DEFAULT_OPENCREATOR_APPLE_TEAM_ID
) {
  const passwordCredentials = [
    env.APPLE_ID,
    env.APPLE_APP_SPECIFIC_PASSWORD,
    env.APPLE_TEAM_ID
  ];
  if (passwordCredentials.some(hasValue)) {
    if (!passwordCredentials.every(hasValue)) {
      throw new Error(
        'APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID '
        + 'must be configured together'
      );
    }
    if (env.APPLE_TEAM_ID.trim() !== teamId) {
      throw new Error(
        `APPLE_TEAM_ID ${env.APPLE_TEAM_ID.trim()} does not match `
        + `the OpenCreator release Team ID ${teamId}`
      );
    }
    return {
      args: [
        '--apple-id',
        env.APPLE_ID.trim(),
        '--password',
        env.APPLE_APP_SPECIFIC_PASSWORD.trim(),
        '--team-id',
        env.APPLE_TEAM_ID.trim()
      ],
      profile: undefined
    };
  }

  const profile = env.APPLE_KEYCHAIN_PROFILE?.trim()
    || DEFAULT_NOTARY_KEYCHAIN_PROFILE;
  return {
    args: [
      '--keychain-profile',
      profile,
      ...(hasValue(env.APPLE_KEYCHAIN)
        ? ['--keychain', env.APPLE_KEYCHAIN.trim()]
        : [])
    ],
    profile
  };
}

export function findDeveloperIdIdentity(teamId, findIdentities = defaultFindIdentities) {
  const output = findIdentities();
  const identity = output
    .split(/\r?\n/)
    .map(line => /"([^"]*Developer ID Application:[^"]+)"/.exec(line)?.[1])
    .find(candidate => candidate?.includes(`(${teamId})`));
  if (identity === undefined) {
    throw new Error(
      `Missing Developer ID Application identity for Team ${teamId}`
    );
  }
  return identity;
}

function validateNotaryKeychainProfile(profile, keychain) {
  const args = [
    'notarytool',
    'history',
    '--keychain-profile',
    profile,
    '--output-format',
    'json'
  ];
  if (hasValue(keychain)) args.push('--keychain', keychain.trim());
  const result = spawnSync('xcrun', args, {
    encoding: 'utf8',
    timeout: 60_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Apple notarization Keychain profile "${profile}" is unavailable or `
      + 'invalid'
    );
  }
}

function defaultFindIdentities() {
  const result = spawnSync('security', [
    'find-identity',
    '-v',
    '-p',
    'codesigning'
  ], {
    encoding: 'utf8',
    timeout: 30_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect macOS signing identities: `
      + `${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
