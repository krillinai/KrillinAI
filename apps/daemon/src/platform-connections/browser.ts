import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnCreatorProcess } from '../creator/process-tree.js';
import type { YtDlpRuntime } from '../creator/yt-dlp/runtime.js';
import { filterYouTubeCookies, hasYouTubeAuthentication, type YouTubeCookie } from './cookies.js';
import { BrowserCloseError } from './browser-close.js';

export type BrowserProfile = { id: string; browser: 'chrome' | 'edge'; label: string; directory: string; preferred: boolean };

export async function listBrowserProfiles(): Promise<BrowserProfile[]> {
  const roots: Array<['chrome' | 'edge', string]> = process.platform === 'darwin' ? [
    ['chrome', join(homedir(), 'Library/Application Support/Google/Chrome')],
    ['edge', join(homedir(), 'Library/Application Support/Microsoft Edge')]
  ] : process.platform === 'win32' ? [
    ['chrome', join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/User Data')],
    ['edge', join(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/User Data')]
  ] : [
    ['chrome', join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'google-chrome')],
    ['edge', join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'microsoft-edge')]
  ];
  const profiles: BrowserProfile[] = [];
  for (const [browser, root] of roots) {
    let state: { profile?: { last_used?: string; info_cache?: Record<string, { name?: string }> } };
    try { state = JSON.parse(await readFile(join(root, 'Local State'), 'utf8')); }
    catch { continue; }
    for (const [directoryName, metadata] of Object.entries(state.profile?.info_cache ?? { Default: {} })) {
      if (!/^(?:Default|Profile \d+)$/.test(directoryName)) continue;
      const directory = join(root, directoryName);
      const exists = await stat(join(directory, 'Network/Cookies')).catch(() =>
        stat(join(directory, 'Cookies')).catch(() => undefined));
      if (!exists?.isFile()) continue;
      profiles.push({ id: createHash('sha256').update(directory).digest('hex').slice(0, 24), browser,
        label: `${browser === 'chrome' ? 'Chrome' : 'Edge'} · ${metadata.name || directoryName}`,
        directory, preferred: directoryName === (state.profile?.last_used ?? 'Default') });
    }
  }
  return profiles.sort((a, b) => Number(b.preferred) - Number(a.preferred));
}

// Use yt-dlp's maintained browser decryption implementation. Only YouTube cookies
// cross the private stdout pipe; no all-site plaintext cookie file is exported.
const READ_BROWSER_COOKIES = String.raw`
import sys, json, time
sys.path.insert(0, sys.argv[1])
from yt_dlp.cookies import extract_cookies_from_browser, YDLLogger
from yt_dlp.utils import DownloadError
class QuietLogger(YDLLogger):
    decryption_failed = False
    failure = 'read-failed'
    def debug(self, *args, **kwargs): pass
    def info(self, *args, **kwargs): pass
    def warning(self, message, *args, **kwargs):
        if 'decrypt' in str(message) or 'key found' in str(message) or 'find-generic-password failed' in str(message) or (sys.platform == 'win32' and 'unknown cookie version' in str(message).lower()):
            self.decryption_failed = True
    def error(self, message, *args, **kwargs):
        if 'could not copy' in str(message).lower() and 'cookie' in str(message).lower():
            self.failure = 'browser-locked'
        elif 'decrypt' in str(message).lower() or 'encrypted key' in str(message).lower() or 'invalid key' in str(message).lower():
            self.failure = 'decryption-failed'
        raise DownloadError('Browser cookie extraction failed')
logger = QuietLogger()
try:
    jar = extract_cookies_from_browser(sys.argv[2], profile=sys.argv[3], logger=logger)
    cookies = []
    for c in jar:
        host = c.domain.lstrip('.').lower()
        expires = c.expires or 0
        if expires > 100000000000:
            expires = int(expires / 1000000 - 11644473600)
        if (host == 'youtube.com' or host.endswith('.youtube.com')) and (expires <= 0 or expires > time.time()):
            cookies.append(dict(name=c.name, value=c.value, domain=c.domain, path=c.path,
                secure=bool(c.secure), httpOnly=c.has_nonstandard_attr('HttpOnly'), expires=expires))
    sys.stdout.write(json.dumps(dict(cookies=cookies, decryptionFailed=logger.decryption_failed)))
except Exception:
    if sys.platform == 'win32':
        sys.stdout.write(json.dumps(dict(failure=logger.failure)))
    sys.exit(1)
`;

export async function readBrowserYouTubeCookies(input: {
  profile: BrowserProfile;
  runtime: YtDlpRuntime | undefined;
  signal: AbortSignal;
}): Promise<YouTubeCookie[]> {
  const { runtime, profile, signal } = input;
  if (!runtime?.script) throw new Error('浏览器连接需要内置 yt-dlp 组件，请更新本地组件后重试。');
  signal.throwIfAborted();
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawnCreatorProcess(runtime.executable, ['-I', '-B', '-c', READ_BROWSER_COOKIES,
      runtime.script!, profile.browser, profile.directory], {
      env: { ...process.env, ...runtime.env }, stdio: ['ignore', 'pipe', 'pipe']
    }, signal);
    const chunks: Buffer[] = [];
    let length = 0;
    child.stdout?.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > 1024 * 1024) { child.kill(); reject(new Error('浏览器 Cookie 读取失败，请重试。')); return; }
      chunks.push(chunk);
    });
    child.stderr?.on('data', () => undefined);
    child.once('error', () => reject(new Error('无法读取浏览器 Cookie，请检查本地组件。')));
    child.once('close', code => {
      if (signal.aborted) reject(new Error('连接已取消。'));
      else if (code !== 0) {
        if (process.platform === 'win32') {
          let failure: string | undefined;
          try { failure = JSON.parse(Buffer.concat(chunks).toString('utf8')).failure; } catch { /* 输出不完整时使用通用错误。 */ }
          reject(failure === 'browser-locked' ? new BrowserCloseError(profile.browser)
            : failure === 'decryption-failed' ? windowsDecryptionError()
            : new Error('无法读取 YouTube 登录态，请重新连接并完成登录。'));
        } else reject(new Error('无法读取 Chrome / Edge 的 Cookie。请允许钥匙串访问；若浏览器加密或文件锁阻止读取，可导入 Cookie 文件。'));
      }
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
  const result = JSON.parse(output) as { cookies?: unknown; decryptionFailed?: boolean };
  const cookies = filterYouTubeCookies(result.cookies);
  if (process.platform === 'win32' && result.decryptionFailed && !hasYouTubeAuthentication(cookies)) {
    throw windowsDecryptionError();
  }
  if (result.decryptionFailed && cookies.length === 0) {
    throw new Error('浏览器 Cookie 解密失败，请允许 macOS 钥匙串访问后重新连接；当前浏览器的加密方式也可能不受 yt-dlp 支持。');
  }
  return cookies;
}

function windowsDecryptionError(): Error {
  return new Error('无法解密 YouTube 登录态，请断开后重新连接并登录。');
}
