import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

/** Keeps a stage's process group alive while its download is paused. */
export class CreatorProcessControl {
  private readonly children = new Set<ChildProcess>();
  private readonly waiters = new Set<() => void>();
  private paused = false;

  constructor(private readonly signal: AbortSignal) {}

  get isPaused(): boolean { return this.paused; }

  attach(child: ChildProcess): void {
    this.children.add(child);
    child.once('exit', () => this.children.delete(child));
    child.once('error', () => this.children.delete(child));
    if (this.paused) signalProcessGroup(child.pid, 'SIGSTOP');
  }

  pause(): void {
    this.signal.throwIfAborted();
    if (this.paused) return;
    try {
      for (const child of this.children) signalProcessGroup(child.pid, 'SIGSTOP');
      this.paused = true;
    } catch (error) {
      for (const child of this.children) signalProcessGroup(child.pid, 'SIGCONT');
      throw error;
    }
  }

  resume(): void {
    this.signal.throwIfAborted();
    for (const child of this.children) signalProcessGroup(child.pid, 'SIGCONT');
    this.paused = false;
    for (const resolve of this.waiters) resolve();
  }

  async waitUntilResumed(): Promise<void> {
    this.signal.throwIfAborted();
    if (!this.paused) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.waiters.delete(resume);
        this.signal.removeEventListener('abort', abort);
      };
      const resume = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(this.signal.reason); };
      this.waiters.add(resume);
      this.signal.addEventListener('abort', abort, { once: true });
    });
  }
}

// Windows uses the existing file-based continuation path. POSIX can retain the
// original downloader, its child processes, and its current connection.
export function createCreatorProcessControl(signal: AbortSignal): CreatorProcessControl | undefined {
  return process.platform === 'win32' ? undefined : new CreatorProcessControl(signal);
}

function signalProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined) return;
  try { process.kill(-pid, signal); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export function spawnCreatorProcess(
  command: string,
  args: string[],
  options: SpawnOptions,
  signal: AbortSignal,
  control?: CreatorProcessControl
): ChildProcess {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
    windowsHide: true
  });
  control?.attach(child);
  const abort = () => void terminateProcessTree(child.pid);
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  child.once('exit', () => signal.removeEventListener('abort', abort));
  return child;
}

export async function terminateProcessTree(pid: number | undefined): Promise<void> {
  if (pid === undefined || pid <= 0) return;
  if (process.platform === 'win32') {
    await new Promise<void>(resolve => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
    });
    return;
  }
  // A stopped process cannot handle SIGTERM until it is continued.
  try { signalProcessGroup(pid, 'SIGCONT'); } catch { /* Still attempt termination. */ }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGTERM'); } catch { return; }
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  try { process.kill(-pid, 'SIGKILL'); } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* Process already exited. */ }
  }
}
