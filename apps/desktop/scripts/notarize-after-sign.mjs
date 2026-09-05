import {
  existsSync,
  mkdtempSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  join
} from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveNotarizationCredentials } from './mac-signing.mjs';
import { submitAndWaitForNotarization } from './apple-notarization.mjs';

export async function afterSign(context) {
  if (process.env.OPENCREATOR_NOTARIZE_MAC_APP !== '1') return;
  if (context.electronPlatformName !== 'darwin') {
    throw new Error('OpenCreator App notarization requires a macOS package');
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${productFilename}.app`);
  if (!existsSync(appPath)) {
    throw new Error(`Signed OpenCreator App is missing: ${appPath}`);
  }

  const teamId = process.env.OPENCREATOR_APPLE_TEAM_ID;
  const credentials = resolveNotarizationCredentials(process.env, teamId);
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'opencreator-notary-')
  );
  const archivePath = join(
    temporaryDirectory,
    `${basename(appPath, '.app')}.zip`
  );
  try {
    runCommand('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      basename(appPath),
      archivePath
    ], {
      cwd: dirname(appPath),
      timeout: 15 * 60_000
    });
    await submitAndWaitForNotarization(archivePath, credentials.args);
    runCommand('xcrun', ['stapler', 'staple', appPath]);
    runCommand('xcrun', ['stapler', 'validate', appPath]);
    runCommand('spctl', [
      '--assess',
      '--type',
      'execute',
      '--verbose=4',
      appPath
    ]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: options.timeout ?? 5 * 60_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit ${String(result.status)}: `
      + `${result.stderr || result.stdout}`
    );
  }
}
