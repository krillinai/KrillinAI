const transientCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

export function retryWindowsFileOperation(operation, {
  platform = process.platform,
  wait = milliseconds => Atomics.wait(waitBuffer, 0, 0, milliseconds)
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      // Executable checks and Windows scanners can briefly retain file handles.
      if (platform !== 'win32' || !transientCodes.has(error?.code) || attempt >= 8) {
        throw error;
      }
      wait(100 * (attempt + 1));
    }
  }
}
