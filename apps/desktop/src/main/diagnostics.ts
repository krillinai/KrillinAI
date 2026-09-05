import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog } from 'electron';
import type { DesktopBootstrapState, DesktopHostResult } from '../shared/types.js';
import { redactValue } from './redaction.js';

export async function exportDesktopDiagnostics(input: {
  state: DesktopBootstrapState;
  dataDir: string;
  logDir: string;
  daemonPid?: number;
  dependencies?: {
    showSaveDialog(options: Electron.SaveDialogOptions): Promise<{
      canceled: boolean;
      filePath?: string;
    }>;
    getAppVersion(): string;
    writeFile(
      path: string,
      contents: string,
      options: { mode: number }
    ): Promise<unknown>;
    readFile?(path: string, encoding: 'utf8'): Promise<string>;
    now(): Date;
  };
}): Promise<DesktopHostResult> {
  const dependencies = input.dependencies ?? {
    showSaveDialog: options => dialog.showSaveDialog(options),
    getAppVersion: () => app.getVersion(),
    writeFile,
    readFile,
    now: () => new Date()
  };
  const now = dependencies.now();
  const result = await dependencies.showSaveDialog({
    title: '导出 OpenCreator 诊断',
    defaultPath: `opencreator-diagnostics-${now.toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || result.filePath === undefined) {
    return { ok: false, code: 'FAILED', message: '已取消导出' };
  }
  const desktopLogTail = await readDesktopLogTail(
    join(input.logDir, 'desktop-main.log'),
    dependencies.readFile ?? readFile
  );
  const payload = redactValue({
    generatedAt: now.toISOString(),
    appVersion: dependencies.getAppVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    state: input.state,
    dataDir: input.dataDir,
    logDir: input.logDir,
    daemonPid: input.daemonPid ?? null,
    ...(desktopLogTail === undefined ? {} : { desktopLogTail })
  });
  await dependencies.writeFile(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600
  });
  return { ok: true };
}

async function readDesktopLogTail(
  path: string,
  read: (path: string, encoding: 'utf8') => Promise<string>
): Promise<string | undefined> {
  try {
    const contents = await read(path, 'utf8');
    return contents.slice(-64 * 1024);
  } catch {
    return undefined;
  }
}
