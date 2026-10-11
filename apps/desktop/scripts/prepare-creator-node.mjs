import { execFileSync } from 'node:child_process';

export function stripMacNodeRuntime(path) {
  execFileSync('strip', ['-S', '-x', path], { stdio: 'inherit' });
  // Stripping invalidates the vendor signature. Restore execution before the
  // release signing hook applies Developer ID and the Node JIT entitlements.
  execFileSync('codesign', ['--force', '--sign', '-', path], { stdio: 'inherit' });
}
