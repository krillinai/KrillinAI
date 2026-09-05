import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireRuntimeLock,
  RuntimeDataInUseError
} from '../../src/runtime-lock.js';

let tempDir = '';

afterEach(() => {
  if (tempDir.length > 0) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('Runtime data lock', () => {
  it('prevents two Runtime owners and releases cleanly', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencreator-runtime-lock-'));
    const release = acquireRuntimeLock(tempDir);
    let conflict: unknown;
    try {
      acquireRuntimeLock(tempDir);
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(RuntimeDataInUseError);
    expect(conflict).toMatchObject({
      code: 'RUNTIME_DATA_IN_USE',
      dataDir: tempDir,
      ownerPid: process.pid,
      details: {
        dataDir: tempDir,
        ownerPid: process.pid
      }
    });
    release();
    const releaseAgain = acquireRuntimeLock(tempDir);
    releaseAgain();
  });

  it('removes a stale lock', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opencreator-runtime-lock-'));
    writeFileSync(join(tempDir, 'opencreator-runtime.lock'), '99999999\n');
    const release = acquireRuntimeLock(tempDir);
    release();
  });
});
