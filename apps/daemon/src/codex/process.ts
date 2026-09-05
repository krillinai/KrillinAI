import type * as childProcess from 'node:child_process';
import crossSpawn from 'cross-spawn';

const spawnCodexProcessImplementation = (
  command: string,
  args: readonly string[] = [],
  options: childProcess.SpawnOptions = {}
): childProcess.ChildProcess => {
  const child = crossSpawn(command, args, {
    ...options,
    detached: options.detached ?? process.platform !== 'win32'
  });
  if (child.pid !== undefined) {
    reportChildProcess('codex_child_started', child.pid);
    child.once('exit', () => {
      if (child.pid !== undefined) reportChildProcess('codex_child_exited', child.pid);
    });
  }
  return child;
};

export const spawnCodexProcess =
  spawnCodexProcessImplementation as typeof childProcess.spawn;
export const spawnCodexProcessSync = crossSpawn.sync as typeof childProcess.spawnSync;

export function terminateCodexProcess(
  child: childProcess.ChildProcess,
  signal: NodeJS.Signals = 'SIGTERM'
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return Promise.resolve();
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise(resolve => {
      // Windows console processes need forced tree termination before the parent disappears.
      const taskkill = crossSpawn(
        'taskkill.exe',
        ['/PID', String(pid), '/T', '/F'],
        {
          stdio: 'ignore',
          windowsHide: true
        }
      );
      let settled = false;
      const finish = (failed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (failed && child.exitCode === null && child.signalCode === null) {
          child.kill(signal);
        }
        resolve();
      };
      const timeout = setTimeout(() => {
        taskkill.kill();
        finish(true);
      }, 2_000);
      timeout.unref();
      taskkill.once('error', () => finish(true));
      taskkill.once('close', code => finish(code !== 0));
    });
  }
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
  return Promise.resolve();
}

function reportChildProcess(
  type: 'codex_child_started' | 'codex_child_exited',
  pid: number
): void {
  const parentPort = (
    process as NodeJS.Process & {
      parentPort?: {
        postMessage(message: unknown): void;
      };
    }
  ).parentPort;
  try {
    parentPort?.postMessage({ type, pid });
  } catch {
    // Child tracking is a Desktop Host enhancement and must not block Codex.
  }
}
