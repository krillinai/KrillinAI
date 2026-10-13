import { join } from 'node:path';
import { spawnCreatorProcess } from '../creator/process-tree.js';

export class BrowserCloseError extends Error {
  constructor(browser: 'chrome' | 'edge') {
    const name = browser === 'chrome' ? 'Chrome' : 'Edge';
    super(`无法读取 ${name} 登录窗口。请关闭刚才打开的 YouTube 登录窗口后重新连接；其他浏览器窗口可以保持打开。`);
  }
}

// 只发送正常关闭请求；浏览器有未保存内容或后台进程时交由用户处理。
export function windowsBrowserCloseScript(browser: 'chrome' | 'edge', targetPids: readonly number[]): string {
  if (targetPids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) throw new Error('Invalid process ID');
  const processName = browser === 'chrome' ? 'chrome' : 'msedge';
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OpenCreatorBrowserClose {
  private delegate bool EnumWindow(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindow callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  public static void RequestClose(int[] processIds) {
    EnumWindows((window, parameter) => {
      uint processId;
      GetWindowThreadProcessId(window, out processId);
      if (Array.IndexOf(processIds, (int)processId) >= 0 && IsWindowVisible(window)) {
        PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero);
      }
      return true;
    }, IntPtr.Zero);
  }
}
'@
$sessionId = (Get-Process -Id $PID).SessionId
$targetPids = @(${targetPids.join(',')})
function Read-BrowserProcesses {
  @(Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | Where-Object {
    $_.SessionId -eq $sessionId -and $targetPids -contains $_.Id
  })
}
$initial = @(Read-BrowserProcesses)
if ($initial.Count -gt 0) { [OpenCreatorBrowserClose]::RequestClose([int[]]@($initial | ForEach-Object { $_.Id })) }
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
  $remaining = @(Read-BrowserProcesses)
  if ($remaining.Count -eq 0) { break }
  Start-Sleep -Milliseconds 200
} while ([DateTime]::UtcNow -lt $deadline)
@{ closed = ($remaining.Count -eq 0) } | ConvertTo-Json -Compress
`;
}

export async function runWindowsBrowserClose(script: string, signal: AbortSignal): Promise<boolean> {
  return (await runWindowsBrowserCommand(script, signal))?.closed === true;
}

export async function runWindowsBrowserCommand(script: string, signal: AbortSignal): Promise<Record<string, unknown> | undefined> {
  signal.throwIfAborted();
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawnCreatorProcess(executable, ['-NoProfile', '-NonInteractive', '-Command', script],
      { stdio: ['ignore', 'pipe', 'ignore'] }, signal);
    let output = '';
    const timeout = setTimeout(() => { child.kill(); resolve(undefined); }, 12_000);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', chunk => {
      output += chunk;
      if (output.length > 4096) { clearTimeout(timeout); child.kill(); resolve(undefined); }
    });
    child.once('error', () => { clearTimeout(timeout); resolve(undefined); });
    child.once('close', code => {
      clearTimeout(timeout);
      if (signal.aborted) { reject(signal.reason); return; }
      try { resolve(code === 0 ? JSON.parse(output) : undefined); }
      catch { resolve(undefined); }
    });
  });
}

export async function windowsProfileBrowserPids(browser: 'chrome' | 'edge', directory: string, signal: AbortSignal): Promise<number[]> {
  const processName = browser === 'chrome' ? 'chrome.exe' : 'msedge.exe';
  const encodedDirectory = Buffer.from(directory, 'utf8').toString('base64');
  const result = await runWindowsBrowserCommand(`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OpenCreatorBrowserArguments {
  [DllImport("shell32.dll", SetLastError = true)] private static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)] string commandLine, out int count);
  [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
  public static bool HasProfile(string commandLine, string directory) {
    int count;
    IntPtr arguments = CommandLineToArgvW(commandLine, out count);
    if (arguments == IntPtr.Zero) return false;
    try {
      for (int i = 0; i < count; i++) {
        string argument = Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments, i * IntPtr.Size));
        if (String.Equals(argument, "--user-data-dir=" + directory, StringComparison.OrdinalIgnoreCase)) return true;
        if (argument == "--user-data-dir" && i + 1 < count && String.Equals(Marshal.PtrToStringUni(Marshal.ReadIntPtr(arguments, (i + 1) * IntPtr.Size)), directory, StringComparison.OrdinalIgnoreCase)) return true;
      }
      return false;
    } finally { LocalFree(arguments); }
  }
}
'@
$directory = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedDirectory}'))
$sessionId = (Get-Process -Id $PID).SessionId
$pids = @(Get-CimInstance Win32_Process -Filter "Name = '${processName}'" | Where-Object {
  $_.SessionId -eq $sessionId -and $_.CommandLine -and [OpenCreatorBrowserArguments]::HasProfile($_.CommandLine, $directory)
} | ForEach-Object { [int]$_.ProcessId })
@{ pids = $pids } | ConvertTo-Json -Compress
`, signal);
  if (!Array.isArray(result?.pids) || result.pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) {
    signal.throwIfAborted();
    throw new Error('无法确认 YouTube 登录窗口，请重试连接。');
  }
  return result.pids as number[];
}
