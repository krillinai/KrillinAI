import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export function verifyRuntimeExecutable(input) {
  const verificationRoot = mkdtempSync(join(tmpdir(), 'opencreator-runtime-check-'));
  try {
    const result = spawnSync(input.path, input.args, {
      cwd: verificationRoot,
      env: input.env,
      encoding: 'utf8',
      timeout: input.timeoutMs ?? 20_000,
      windowsHide: true
    });
    const stdout = String(result.stdout ?? '').trim();
    const stderr = String(result.stderr ?? '').trim();
    const output = [stdout, stderr].filter(Boolean).join('\n');
    if (result.error || result.status !== 0) {
      throw new Error(
        `${input.name} failed its runtime check: `
        + diagnosticOutput(result.error, result.status, stdout, stderr)
      );
    }
    input.expected.lastIndex = 0;
    if (!input.expected.test(output)) {
      throw new Error(
        `${input.name} returned an unexpected version or help response: `
        + diagnosticOutput(undefined, result.status, stdout, stderr)
      );
    }
    return output;
  } finally {
    rmSync(verificationRoot, { recursive: true, force: true });
  }
}

function diagnosticOutput(error, status, stdout, stderr) {
  const parts = [
    error ? `error=${error.message}` : undefined,
    status === null ? undefined : `exit=${status}`,
    `stdout=${preview(stdout)}`,
    `stderr=${preview(stderr)}`
  ].filter(Boolean);
  return parts.join(' ');
}

function preview(value) {
  if (!value) return '<empty>';
  const limit = 2_000;
  return JSON.stringify(value.length > limit ? `${value.slice(0, limit)}...` : value);
}
