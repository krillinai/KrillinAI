import { execFileSync } from 'node:child_process';

const retryDelays = [1_000, 2_000];

export function downloadGoModules({
  cwd,
  env,
  execute = execFileSync,
  wait = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  report = output => process.stderr.write(output)
}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const output = execute('go', ['mod', 'download'], {
        cwd,
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 16 * 1024 * 1024
      });
      if (output) report(String(output));
      return;
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      if (output) report(output);
      if (attempt >= retryDelays.length || !isTransientDownloadError(output)) throw error;
      const delay = retryDelays[attempt];
      report(`Go module download hit a transient network error; retrying in ${delay}ms (${attempt + 2}/3).\n`);
      wait(delay);
    }
  }
}

function isTransientDownloadError(output) {
  if (/checksum mismatch|SECURITY ERROR|unknown revision|invalid version|401 Unauthorized|403 Forbidden|404 Not Found|410 Gone/i.test(output)) {
    return false;
  }
  return /operation timed out|i\/o timeout|TLS handshake timeout|connection (?:reset|refused)|network is unreachable|temporary failure in name resolution|temporary network failure|unexpected EOF|429 Too Many Requests|50[0234] (?:Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error)/i.test(output);
}
