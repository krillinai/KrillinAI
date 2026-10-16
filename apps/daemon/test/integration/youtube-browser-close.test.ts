import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { runWindowsBrowserClose, windowsBrowserCloseScript } from '../../src/platform-connections/browser-close.js';
import { terminateProcessTree } from '../../src/creator/process-tree.js';

const chrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
  .filter((root): root is string => !!root).map(root => join(root, 'Google/Chrome/Application/chrome.exe')).find(existsSync);

it('拒绝非法 PID，防止关闭脚本注入', () => {
  for (const pid of [0, -1, NaN, 1.5]) expect(() => windowsBrowserCloseScript('chrome', [pid])).toThrow();
});

it.runIf(process.platform === 'win32')('没有目标进程时正常返回，取消会终止本任务的关闭脚本', async () => {
  expect(await runWindowsBrowserClose(windowsBrowserCloseScript('chrome', []), AbortSignal.timeout(15_000))).toBe(true);
  const controller = new AbortController();
  const work = runWindowsBrowserClose('Start-Sleep -Seconds 60', controller.signal);
  const rejected = expect(work).rejects.toThrow();
  controller.abort();
  await rejected;
}, 20_000);

it.runIf(process.platform === 'win32' && !!chrome)('发送正常关闭请求可关闭隔离 Chrome 的全部窗口，不触碰用户浏览器', async () => {
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-close-'));
  let child: ChildProcess | undefined;
  try {
    child = spawn(chrome!, [`--user-data-dir=${root}`, '--no-first-run', '--no-default-browser-check',
      '--disable-background-mode', '--disable-gpu', '--new-window', 'about:blank'], { stdio: 'ignore' });
    const pid = child.pid!;
    const powershell = join(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    await vi.waitFor(() => {
      expect(child!.exitCode).toBeNull();
      const handle = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-Process -Id ${pid}).MainWindowHandle.ToInt64()`], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      expect(Number(handle.trim())).not.toBe(0);
    }, { timeout: 15_000, interval: 300 });
    execFileSync(chrome!, [`--user-data-dir=${root}`, '--new-window', 'about:blank'], { timeout: 5000, stdio: 'ignore' });
    expect(await runWindowsBrowserClose(windowsBrowserCloseScript('chrome', [pid]), AbortSignal.timeout(15_000))).toBe(true);
    await vi.waitFor(() => expect(child!.exitCode).not.toBeNull());
  } finally {
    if (child?.exitCode === null) await terminateProcessTree(child.pid);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}, 35_000);

it.runIf(process.platform === 'win32' && !!chrome)('仅剩后台 Chrome 时无法正常关闭，返回失败供用户手动处理', async () => {
  const root = await mkdtemp(join(tmpdir(), 'youtube-browser-background-'));
  const child = spawn(chrome!, [`--user-data-dir=${root}`, '--headless', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  try {
    await vi.waitFor(async () => expect(await readFile(join(root, 'DevToolsActivePort'), 'utf8')).toMatch(/^\d+/), { timeout: 10_000 });
    expect(await runWindowsBrowserClose(windowsBrowserCloseScript('chrome', [child.pid!]), AbortSignal.timeout(15_000))).toBe(false);
    expect(child.exitCode).toBeNull();
  } finally {
    await terminateProcessTree(child.pid);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}, 30_000);
