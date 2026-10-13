import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { openWindowsYouTubeLogin, windowsYouTubeBrowserArgs, type BrowserLoginSession } from '../../src/platform-connections/browser-login.js';
import { windowsProfileBrowserPids } from '../../src/platform-connections/browser-close.js';
import { resolveYtDlpRuntime } from '../../src/creator/yt-dlp/runtime.js';
import { terminateProcessTree } from '../../src/creator/process-tree.js';

const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
  .some(root => root && existsSync(join(root, 'Google/Chrome/Application/chrome.exe')));

it('专用登录参数不启用浏览器调试、自动化或内嵌 Chromium', () => {
  const args = windowsYouTubeBrowserArgs('C:\\test profile');
  expect(args[0]).toBe('--user-data-dir=C:\\test profile');
  expect(args.at(-1)).toMatch(/^https:\/\/accounts.google.com\//);
  expect(args.join(' ')).not.toMatch(/remote-debugging|enable-automation|headless|disable-web-security/);
});

it.runIf(process.platform === 'win32' && chrome)('真实 Chrome 专用目录生成可解密 v10 Cookie，关闭时其他窗口仍在运行', async () => {
  const root = await mkdtemp(join(tmpdir(), 'youtube login with spaces '));
  const otherRoot = await mkdtemp(join(tmpdir(), 'youtube-other-window-'));
  const sessions: BrowserLoginSession[] = [];
  let loaded!: () => void;
  const visited = new Promise<void>(resolve => { loaded = resolve; });
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': [
      'SID=fixture-SID; Path=/; Max-Age=3600; HttpOnly', 'SAPISID=fixture-SAPISID; Path=/; Max-Age=3600; HttpOnly'
    ] });
    response.end('<!doctype html><title>OpenCreator login test</title>Local cookie test');
    loaded();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const signal = AbortSignal.timeout(40_000);
    const other = await openWindowsYouTubeLogin({ root: otherRoot, signal, url: 'about:blank' });
    sessions.push(other);
    const login = await openWindowsYouTubeLogin({ root, signal, url: `http://127.0.0.1:${port}` });
    sessions.push(login);
    await Promise.race([visited, new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })]);
    expect((await windowsProfileBrowserPids('chrome', join(root, 'browser-chrome'), signal)).length).toBeGreaterThan(0);
    await login.close(signal);
    await login.exited;
    expect((await windowsProfileBrowserPids('chrome', join(otherRoot, 'browser-chrome'), signal)).length).toBeGreaterThan(0);
    const db = new Database(join(login.profile.directory, 'Network/Cookies'), { readonly: true });
    try {
      const rows = db.prepare("SELECT encrypted_value FROM cookies WHERE host_key = '127.0.0.1' AND name IN ('SID','SAPISID')")
        .all() as Array<{ encrypted_value: Buffer }>;
      expect(rows).toHaveLength(2);
      expect(rows.map(row => row.encrypted_value.subarray(0, 3).toString())).toEqual(['v10', 'v10']);
    } finally { db.close(); }
    if (process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT) {
      const resourceRoot = process.env.OPENCREATOR_TEST_BROWSER_RUNTIME_ROOT;
      const manifest = JSON.parse(await readFile(join(resourceRoot, 'manifest.json'), 'utf8'));
      const runtime = resolveYtDlpRuntime({ resourceRoot, manifest })!;
      // 只验证 localhost 测试 Cookie 的解密，不接触真实账号，也不代表 Google 登录已验证。
      const script = "import sys,json; sys.path.insert(0,sys.argv[1]); from yt_dlp.cookies import extract_cookies_from_browser; jar=extract_cookies_from_browser('chrome',profile=sys.argv[2]); print(json.dumps(sorted(c.name for c in jar if c.domain=='127.0.0.1' and c.value=='fixture-'+c.name)))";
      const result = execFileSync(runtime.executable, ['-I', '-B', '-c', script, runtime.script!, login.profile.directory],
        { encoding: 'utf8', windowsHide: true, timeout: 15_000, env: { ...process.env, ...runtime.env }, stdio: ['ignore', 'pipe', 'ignore'] });
      expect(JSON.parse(result)).toEqual(['SAPISID', 'SID']);
    }
    await other.close(signal);
  } finally {
    for (const session of sessions) { await session.close(AbortSignal.timeout(12_000)).catch(() => undefined); await session.dispose(); }
    for (const directory of [root, otherRoot]) {
      for (const pid of await windowsProfileBrowserPids('chrome', join(directory, 'browser-chrome'), AbortSignal.timeout(15_000))) {
        await terminateProcessTree(pid);
      }
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 60_000);
