import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function readRuntimePid(dataDir: string): number | undefined {
  let value: string;
  try {
    value = readFileSync(join(dataDir, 'opencreator-runtime.lock'), 'utf8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const pid = /^\d+$/.test(value) ? Number(value) : NaN;
  assertSafePid(pid);
  return pid;
}

export async function stopRecordedProcess(
  pid: number,
  options: { processGroup?: boolean; force?: boolean } = {}
): Promise<void> {
  assertSafePid(pid);
  const processGroup = options.processGroup === true && process.platform !== 'win32';
  if (!isRunning(pid, processGroup)) return;
  signalProcess(pid, processGroup, options.force === true ? 'SIGKILL' : 'SIGTERM');
  if (await waitForExit(pid, processGroup)) return;
  signalProcess(pid, processGroup, 'SIGKILL');
  if (!await waitForExit(pid, processGroup)) {
    throw new Error(`E2E process ${pid} did not stop; refusing to remove its data directory`);
  }
}

function assertSafePid(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 1 || pid === process.pid) {
    throw new Error(`Invalid E2E process PID: ${pid}`);
  }
}

function signalProcess(pid: number, processGroup: boolean, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (error) {
      if (isRunning(pid, false)) throw error;
    }
    return;
  }
  try {
    process.kill(processGroup ? -pid : pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function isRunning(pid: number, processGroup: boolean): boolean {
  if (process.platform === 'win32') {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw error;
    }
  }
  // Orphaned zombies cannot write files and may await reaping by the CI host.
  const processes = execFileSync('ps', ['-eo', 'pid=,pgid=,stat='], { encoding: 'utf8' });
  return processes.split('\n').some(line => {
    const [processId, groupId, status = ''] = line.trim().split(/\s+/);
    return Number(processGroup ? groupId : processId) === pid && !status.startsWith('Z');
  });
}

async function waitForExit(pid: number, processGroup: boolean): Promise<boolean> {
  const deadline = Date.now() + 3_000;
  while (isRunning(pid, processGroup)) {
    if (Date.now() >= deadline) return false;
    await delay(100);
  }
  return true;
}
