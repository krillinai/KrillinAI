import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnCreatorProcess, terminateProcessTree } from '../creator/process-tree.js';
import { runWindowsBrowserClose, windowsBrowserCloseScript, windowsProfileBrowserPids } from './browser-close.js';
import type { BrowserProfile } from './browser.js';

export type BrowserLoginSession = {
  profile: BrowserProfile;
  exited: Promise<void>;
  close(signal: AbortSignal): Promise<void>;
  dispose(): Promise<void>;
};

export class LoginBrowserCloseError extends Error {
  constructor() { super('请关闭刚才打开的 YouTube 登录窗口，再点击“完成登录”。其他 Chrome 窗口可以保持打开。'); }
}

export function windowsYouTubeBrowserArgs(directory: string, url = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'): string[] {
  return [`--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check', '--disable-background-mode',
    '--new-window', url];
}

export async function openWindowsYouTubeLogin(input: { root: string; signal: AbortSignal; url?: string }): Promise<BrowserLoginSession> {
  input.signal.throwIfAborted();
  const executable = await findChrome();
  const directory = resolve(input.root, 'browser-chrome');
  await mkdir(directory, { recursive: true });
  const existing = await windowsProfileBrowserPids('chrome', directory, input.signal);
  input.signal.throwIfAborted();
  // 普通 Chrome 会话：不启用调试或自动化，使用独立用户目录保存登录。
  const browser = spawn(executable, windowsYouTubeBrowserArgs(directory, input.url), { stdio: 'ignore', windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    browser.once('spawn', resolve);
    browser.once('error', () => reject(new Error('无法打开 Chrome 登录窗口，请重试连接。')));
  });
  const pids = existing.length ? existing : [browser.pid!];
  const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const watcher = spawnCreatorProcess(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    `Wait-Process -Id @(${pids.join(',')}) -ErrorAction SilentlyContinue`], { stdio: 'ignore' }, input.signal);
  const exited = new Promise<void>(resolve => {
    watcher.once('close', code => { if (code === 0 && !input.signal.aborted) resolve(); });
    watcher.once('error', () => { /* 监测不可用时仍可通过“完成登录”保存。 */ });
  });
  return {
    profile: { id: createHash('sha256').update(directory).digest('hex').slice(0, 24), browser: 'chrome',
      label: 'Chrome · OpenCreator', directory: join(directory, 'Default'), preferred: true },
    exited,
    async close(signal) {
      // 每次关闭前按完整用户目录重新确认归属，绝不请求关闭用户的普通 Chrome。
      const current = await windowsProfileBrowserPids('chrome', directory, signal);
      const closed = await runWindowsBrowserClose(windowsBrowserCloseScript('chrome', current), signal);
      signal.throwIfAborted();
      if (!closed) throw new LoginBrowserCloseError();
    },
    async dispose() { if (watcher.exitCode === null) await terminateProcessTree(watcher.pid); }
  };
}

async function findChrome(): Promise<string> {
  for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
    if (!root) continue;
    const executable = join(root, 'Google/Chrome/Application/chrome.exe');
    if ((await stat(executable).catch(() => undefined))?.isFile()) return executable;
  }
  throw new Error('未找到 Chrome，请安装 Chrome 后重新连接 YouTube。');
}
