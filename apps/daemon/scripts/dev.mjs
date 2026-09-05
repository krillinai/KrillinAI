import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const daemonDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'src/main.ts'],
  {
    cwd: daemonDir,
    env: {
      ...process.env,
      OPENCREATOR_RUNTIME_CHANNEL: 'development',
      OPENCREATOR_MANAGED_PARENT_PID:
        process.env.OPENCREATOR_MANAGED_PARENT_PID ?? String(process.pid)
    },
    stdio: 'inherit'
  }
);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code !== null) {
      resolveExit(code);
      return;
    }
    resolveExit(signal === 'SIGINT' ? 130 : 143);
  });
});

process.exitCode = exitCode;
