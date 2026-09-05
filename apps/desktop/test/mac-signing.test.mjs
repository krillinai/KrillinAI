import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  configureMacDirectorySigning,
  configureMacReleaseSigning,
  findDeveloperIdIdentity,
  resolveNotarizationCredentials
} from '../scripts/mac-signing.mjs';

const identity =
  'Developer ID Application: Junxi YIN (NVRH5R5DJ5)';
const identities = () => (
  `  1) ABCDEF "${identity}"\n`
  + '     1 valid identities found\n'
);

describe('macOS directory signing', () => {
  it('keeps ordinary local packages ad-hoc without accessing a private key', () => {
    const result = configureMacDirectorySigning({
      platform: 'darwin',
      env: {},
      signed: false
    });

    expect(result.mode).toBe('adhoc');
    expect(result.args).toContain('--config.mac.identity=null');
    expect(result.args).toContain('--config.mac.notarize=false');
    expect(result.builderEnv.CSC_IDENTITY_AUTO_DISCOVERY).toBe('false');
  });

  it('uses the configured Developer ID for an explicitly signed package', () => {
    const result = configureMacDirectorySigning({
      platform: 'darwin',
      env: {},
      signed: true,
      teamId: 'NVRH5R5DJ5',
      findIdentities: identities
    });

    expect(result).toMatchObject({
      mode: 'developer-id',
      teamId: 'NVRH5R5DJ5',
      identity
    });
    expect(result.args).toEqual(['--config.mac.notarize=false']);
    expect(result.builderEnv.CSC_NAME).toBe(
      'Junxi YIN (NVRH5R5DJ5)'
    );
  });

  it('does not implicitly access a configured signing certificate', () => {
    const result = configureMacDirectorySigning({
      platform: 'darwin',
      env: { CSC_NAME: identity },
      signed: false
    });

    expect(result.mode).toBe('adhoc');
    expect(result.builderEnv.CSC_NAME).toBe(identity);
  });

  it('rejects signed directory packaging outside macOS', () => {
    expect(() => configureMacDirectorySigning({
      platform: 'linux',
      env: {},
      signed: true
    })).toThrow(/only supported on macOS/i);
  });

  it('requires the expected Team identity', () => {
    expect(findDeveloperIdIdentity('NVRH5R5DJ5', identities)).toBe(identity);
    expect(() => findDeveloperIdIdentity('OTHERTEAM', identities)).toThrow(
      /Missing Developer ID Application identity/
    );
  });

  it('requires complete Developer ID and notarization credentials in CI', () => {
    const result = configureMacReleaseSigning({
      platform: 'darwin',
      env: {
        CSC_LINK: 'base64-p12',
        CSC_KEY_PASSWORD: 'certificate-password',
        APPLE_ID: 'release@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
        APPLE_TEAM_ID: 'NVRH5R5DJ5'
      },
      teamId: 'NVRH5R5DJ5'
    });

    expect(result).toMatchObject({
      mode: 'developer-id',
      teamId: 'NVRH5R5DJ5',
      identity: undefined,
      notarizationArgs: [
        '--apple-id',
        'release@example.com',
        '--password',
        'app-password',
        '--team-id',
        'NVRH5R5DJ5'
      ]
    });
  });

  it('supports the existing Clawee signing identity and notary profile locally', () => {
    const validateNotaryProfile = vi.fn();
    const result = configureMacReleaseSigning({
      platform: 'darwin',
      env: {},
      teamId: 'NVRH5R5DJ5',
      findIdentities: identities,
      validateNotaryProfile
    });

    expect(result).toMatchObject({
      mode: 'developer-id',
      teamId: 'NVRH5R5DJ5',
      identity,
      notarizationArgs: ['--keychain-profile', 'clawee-notary']
    });
    expect(result.builderEnv.CSC_NAME).toBe(
      'Junxi YIN (NVRH5R5DJ5)'
    );
    expect(validateNotaryProfile).toHaveBeenCalledWith(
      'clawee-notary',
      undefined
    );
  });

  it('rejects incomplete or mismatched formal release credentials', () => {
    expect(() => configureMacReleaseSigning({
      platform: 'darwin',
      env: { CSC_LINK: 'base64-p12' }
    })).toThrow(/CSC_KEY_PASSWORD/);

    expect(() => configureMacReleaseSigning({
      platform: 'darwin',
      env: {
        CSC_LINK: 'base64-p12',
        CSC_KEY_PASSWORD: 'certificate-password',
        APPLE_ID: 'release@example.com',
        APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
        APPLE_TEAM_ID: 'OTHERTEAM'
      },
      teamId: 'NVRH5R5DJ5'
    })).toThrow(/does not match/);
  });

  it('resolves the shared local notarization profile for release hooks', () => {
    expect(resolveNotarizationCredentials(
      {},
      'NVRH5R5DJ5'
    )).toEqual({
      args: ['--keychain-profile', 'clawee-notary'],
      profile: 'clawee-notary'
    });
  });

  it('signs Creator Runtime in afterPack without replacing Codex signatures', () => {
    const builderConfig = readFileSync(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    );
    const pattern = builderConfig.match(/signIgnore:\n\s+- '([^']+)'/)?.[1];
    expect(pattern).toBeDefined();
    const shouldIgnore = new RegExp(pattern);
    const resources = '/OpenCreator.app/Contents/Resources';
    const ignoredCreatorBinaries = [
      'bin/ffmpeg',
      'bin/ffprobe',
      'bin/krillinai-cli',
      'yt-dlp-runtime/python/bin/python3.13',
      'yt-dlp-runtime/python/lib/libpython3.13.dylib',
      'yt-dlp-runtime/python/lib/python3.13/lib-dynload/_dbm.cpython-313-darwin.so'
    ];

    for (const path of ignoredCreatorBinaries) {
      expect(shouldIgnore.test(
        `${resources}/creator-runtime/krillinai/${path}`
      )).toBe(true);
    }
    expect(shouldIgnore.test(
      `${resources}/daemon/node_modules/better_sqlite3.node`
    )).toBe(false);
    expect(shouldIgnore.test(
      `${resources}/creator-runtime/krillinai/manifest.json`
    )).toBe(true);
    expect(shouldIgnore.test(
      `${resources}/codex-runtime/bin/codex`
    )).toBe(true);
    expect(builderConfig).toContain(
      'afterPack: ./scripts/sign-creator-runtime-after-pack.mjs'
    );
    expect(builderConfig).toContain(
      'afterSign: ./scripts/notarize-after-sign.mjs'
    );
    expect(builderConfig).toContain('notarize: false');
    expect(builderConfig).toContain('dmg:\n  sign: true');
  });

  it('keeps signed directory checks separate from notarized release checks', () => {
    const packageScript = readFileSync(
      new URL('../scripts/package-release.mjs', import.meta.url),
      'utf8'
    );
    const verifier = readFileSync(
      new URL('../scripts/verify-package.mjs', import.meta.url),
      'utf8'
    );

    expect(packageScript).toContain(
      "OPENCREATOR_REQUIRE_NOTARIZED_MAC_APP: '1'"
    );
    expect(verifier).toContain(
      "process.env.OPENCREATOR_REQUIRE_NOTARIZED_MAC_APP === '1'"
    );
  });

  it('keeps Electron cookie encryption disabled to avoid macOS Safe Storage access', () => {
    const builderConfig = readFileSync(
      new URL('../electron-builder.yml', import.meta.url),
      'utf8'
    );

    expect(builderConfig).toContain('enableCookieEncryption: false');
    expect(builderConfig).not.toContain('enableCookieEncryption: true');
  });
});
