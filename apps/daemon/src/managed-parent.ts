export function parseManagedParentPid(
  value: string | undefined,
  currentPid = process.pid
): number | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) return undefined;
  const pid = Number(normalized);
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === currentPid) {
    throw new Error(`Invalid OpenCreator managed parent PID: ${normalized}`);
  }
  return pid;
}

export function installManagedParentWatch(input: {
  parentPid?: number;
  close(): Promise<void>;
  exit(code: number): void;
  onError(error: unknown): void;
  intervalMs?: number;
  isAlive?(pid: number): boolean;
}): () => void {
  if (input.parentPid === undefined) return () => undefined;
  const parentPid = input.parentPid;
  const isAlive = input.isAlive ?? processIsAlive;
  let stopped = false;
  let closing = false;
  const timer = setInterval(() => {
    if (stopped || closing || isAlive(parentPid)) return;
    closing = true;
    clearInterval(timer);
    void input.close()
      .catch(error => {
        input.onError(error);
      })
      .finally(() => {
        input.exit(0);
      });
  }, input.intervalMs ?? 2_000);
  timer.unref();
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
