import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRuntimePid, stopRecordedProcess } from '../../e2e/fixtures/process-cleanup.js';

const directories: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.pid !== undefined) {
      await stopRecordedProcess(child.pid, { processGroup: true, force: true });
    }
  }
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function createDataDir(): string {
  const path = mkdtempSync(join(tmpdir(), 'opencreator-cleanup-test-'));
  directories.push(path);
  return path;
}

describe('E2E runtime process cleanup', () => {
  it('stops a detached writer before removing its runtime directory', async () => {
    const rootDir = createDataDir();
    const dataDir = join(rootDir, 'runtime');
    mkdirSync(dataDir);
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const dataDir = process.argv[1];
      writeFileSync(join(dataDir, 'opencreator-runtime.lock'), String(process.pid));
      process.on('SIGTERM', () => {});
      setInterval(() => writeFileSync(join(dataDir, 'state.json'), String(Date.now())), 5);
      console.log('ready');
    `, dataDir], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    await once(child.stdout!, 'data');

    const daemonPid = readRuntimePid(dataDir);
    expect(daemonPid).toBe(child.pid);
    const exited = once(child, 'exit');
    await stopRecordedProcess(daemonPid!, { processGroup: true });
    await exited;
    rmSync(rootDir, { recursive: true, force: true });
    expect(existsSync(rootDir)).toBe(false);
  }, 10_000);

  it('stops remaining group members after their parent exits', async () => {
    if (process.platform === 'win32') return;
    const dataDir = createDataDir();
    const writer = `
      const fs = require('node:fs');
      setInterval(() => fs.writeFileSync(process.argv[1] + '/state.json', String(Date.now())), 5);
      console.log('ready');
    `;
    const child = spawn(process.execPath, ['-e', `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', process.argv[1], process.argv[2]], {
        stdio: ['ignore', 'pipe', 'ignore']
      });
      child.stdout.once('data', () => {
        console.log('ready');
        child.unref();
        process.exit(0);
      });
    `, writer, dataDir], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    const exited = once(child, 'exit');
    await once(child.stdout!, 'data');
    await exited;

    await stopRecordedProcess(child.pid!, { processGroup: true });
    rmSync(dataDir, { recursive: true, force: true });
    expect(existsSync(dataDir)).toBe(false);
  });

  it('allows a missing runtime lock and rejects unsafe lock PIDs', async () => {
    const dataDir = createDataDir();
    expect(readRuntimePid(dataDir)).toBeUndefined();
    for (const value of ['0', '1', '-2', String(process.pid), '123junk', '9007199254740992']) {
      writeFileSync(join(dataDir, 'opencreator-runtime.lock'), value);
      expect(() => readRuntimePid(dataDir)).toThrow('Invalid E2E process PID');
    }
    await expect(stopRecordedProcess(process.pid)).rejects.toThrow('Invalid E2E process PID');
  });
});
