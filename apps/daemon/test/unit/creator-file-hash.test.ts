import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256CreatorFile } from '../../src/creator/file-hash.js';

let root = '';
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe('streamed Creator file hashing', () => {
  it('hashes multi-chunk output without loading the complete file into a buffer', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-file-hash-'));
    const path = join(root, 'output.mp4');
    const content = Buffer.alloc(2 * 1024 * 1024 + 7, 0x42);
    await writeFile(path, content);
    expect(await sha256CreatorFile(path)).toBe(createHash('sha256').update(content).digest('hex'));
    const signal = AbortSignal.abort();
    await expect(sha256CreatorFile(path, signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps the filesystem code when an output cannot be opened', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-file-hash-'));
    await expect(sha256CreatorFile(join(root, 'missing.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
