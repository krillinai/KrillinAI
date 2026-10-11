import Database from 'better-sqlite3';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readBrowserYouTubeCookies } from '../../src/platform-connections/browser.js';
import { hasYouTubeAuthentication } from '../../src/platform-connections/cookies.js';
import { resolveYtDlpRuntime } from '../../src/creator/yt-dlp/runtime.js';

it.runIf(!!process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT)('uses the real portable Python and yt-dlp importer and normalizes Chromium cookie types and epoch', async () => {
  const resourceRoot = process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT!;
  const manifest = JSON.parse(await readFile(join(resourceRoot, 'manifest.json'), 'utf8'));
  const runtime = resolveYtDlpRuntime({ resourceRoot, manifest });
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-import-'));
  const directory = join(root, 'Default');
  try {
    await mkdir(directory);
    const db = new Database(join(directory, 'Cookies'));
    try {
      db.exec("CREATE TABLE meta (key TEXT, value TEXT); INSERT INTO meta VALUES ('version','24'); CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER)");
      const insert = db.prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?)');
      const future = Math.floor(Date.now() / 1000) + 3600;
      const webkitFuture = (future + 11644473600) * 1000000;
      for (const name of ['SID', 'SAPISID']) insert.run('.youtube.com', name, `fixture-${name}`, Buffer.alloc(0), '/', webkitFuture, 1);
      insert.run('.google.com', 'SID', 'excluded', Buffer.alloc(0), '/', webkitFuture, 1);
      insert.run('.youtube.com.evil.test', 'SID', 'excluded', Buffer.alloc(0), '/', webkitFuture, 1);
      insert.run('.youtube.com', 'expired', 'excluded', Buffer.alloc(0), '/', 11644473601000000, 1);
      const cookies = await readBrowserYouTubeCookies({ profile: { id: 'fixture', browser: 'edge', directory, label: 'Test', preferred: true }, runtime, signal: AbortSignal.timeout(15000) });
      expect(cookies).toHaveLength(2);
      expect(hasYouTubeAuthentication(cookies)).toBe(true);
      expect(cookies).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'SID', secure: true, expires: future })]));
    } finally { db.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);
