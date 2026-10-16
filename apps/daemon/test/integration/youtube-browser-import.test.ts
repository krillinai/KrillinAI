import Database from 'better-sqlite3';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readBrowserYouTubeCookies } from '../../src/platform-connections/browser.js';
import { hasYouTubeAuthentication } from '../../src/platform-connections/cookies.js';
import { resolveYtDlpRuntime } from '../../src/creator/yt-dlp/runtime.js';
import { BrowserCloseError } from '../../src/platform-connections/browser-close.js';
import { terminateProcessTree } from '../../src/creator/process-tree.js';

async function writeWindowsLocalState(root: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const key = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "Add-Type -AssemblyName System.Security; $key = [Security.Cryptography.ProtectedData]::Protect([byte[]](1..32), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes('DPAPI') + $key)"],
  { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
  await writeFile(join(root, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: key } }));
}

it.runIf(!!process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT)('uses the real portable Python and yt-dlp importer and normalizes Chromium cookie types and epoch', async () => {
  const resourceRoot = process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT!;
  const manifest = JSON.parse(await readFile(join(resourceRoot, 'manifest.json'), 'utf8'));
  const runtime = resolveYtDlpRuntime({ resourceRoot, manifest });
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-import-'));
  const directory = join(root, 'Default');
  try {
    await mkdir(directory);
    await writeWindowsLocalState(root);
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

it.runIf(process.platform === 'win32' && !!process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT)('Windows 真实文件锁会提示手动关闭浏览器', async () => {
  const resourceRoot = process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT!;
  const manifest = JSON.parse(await readFile(join(resourceRoot, 'manifest.json'), 'utf8'));
  const runtime = resolveYtDlpRuntime({ resourceRoot, manifest });
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-locked-'));
  const directory = join(root, 'Default');
  await mkdir(directory);
  const file = join(directory, 'Cookies');
  const db = new Database(file); db.close();
  const script = `$stream = [IO.File]::Open('${file.replace(/'/g, "''")}', [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None); Write-Output 'ready'; Start-Sleep -Seconds 30; $stream.Dispose()`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('文件锁准备超时')), 5000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout!.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    await expect(readBrowserYouTubeCookies({ profile: { id: 'fixture', browser: 'chrome', directory, label: 'Test', preferred: true },
      runtime, signal: AbortSignal.timeout(15_000) })).rejects.toBeInstanceOf(BrowserCloseError);
  } finally {
    await terminateProcessTree(child.pid);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}, 20_000);

it.runIf(process.platform === 'win32' && !!process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT)('新版 Chromium v20 加密失败时明确提示解密问题，不误报为未登录', async () => {
  const resourceRoot = process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT!;
  const manifest = JSON.parse(await readFile(join(resourceRoot, 'manifest.json'), 'utf8'));
  const runtime = resolveYtDlpRuntime({ resourceRoot, manifest });
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-v20-'));
  const directory = join(root, 'Default');
  try {
    await mkdir(directory);
    await writeWindowsLocalState(root);
    const db = new Database(join(directory, 'Cookies'));
    try {
      db.exec("CREATE TABLE meta (key TEXT, value TEXT); INSERT INTO meta VALUES ('version','24'); CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER)");
      const future = (Math.floor(Date.now() / 1000) + 3600 + 11644473600) * 1000000;
      db.prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?)').run('.youtube.com', 'SID', '', Buffer.from('v20fixture-encrypted-cookie'), '/', future, 1);
    } finally { db.close(); }
    await expect(readBrowserYouTubeCookies({ profile: { id: 'fixture', browser: 'chrome', directory, label: 'Test', preferred: true },
      runtime, signal: AbortSignal.timeout(15_000) })).rejects.toThrow('无法解密');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);
