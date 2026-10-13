import { AsyncLocalStorage } from 'node:async_hooks';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConnectionPlatform, PlatformConnectionState } from '@opencreator/protocol';
import { readPrivateJsonFile, writePrivateJsonFile } from '../config/private-json-file.js';
import type { YtDlpRuntime } from '../creator/yt-dlp/runtime.js';
import { listBrowserProfiles, readBrowserPlatformCookies, type BrowserProfile } from './browser.js';
import { LoginBrowserCloseError, openWindowsYouTubeLogin, type BrowserLoginSession } from './browser-login.js';
import { filterPlatformCookies, hasPlatformSession, parsePlatformCookies,
  serializePlatformCookies, type PlatformCookie } from './cookies.js';

type Credential = { version: 1; cookies: PlatformCookie[]; connectedAt: string;
  browser?: 'chrome' | 'edge'; profileId?: string; invalidated?: boolean };
type ConnectionAttempt = { controller: AbortController; work: Promise<void>; completeLogin?: () => void };

type ConnectionState<P extends ConnectionPlatform> = PlatformConnectionState & { platform: P };
export type PlatformConnectionOptions = {
  root: string;
  platform?: ConnectionPlatform;
  getRuntime(): YtDlpRuntime | undefined;
  listProfiles?: typeof listBrowserProfiles;
  readBrowserCookies?: typeof readBrowserPlatformCookies;
  openLoginBrowser?: typeof openWindowsYouTubeLogin;
  connectionTimeoutMs?: number;
  osPlatform?: NodeJS.Platform;
};

export class PlatformConnectionService<P extends ConnectionPlatform = ConnectionPlatform> {
  private state: ConnectionState<P>;
  private readonly platform: P;
  private attempt?: ConnectionAttempt;
  private context = new AsyncLocalStorage<{ path: string; credential: Credential }>();
  private mutations: Promise<unknown> = Promise.resolve();
  private readonly credentialFile: string;
  constructor(private input: PlatformConnectionOptions & { platform?: P }) {
    this.platform = (input.platform ?? 'youtube') as P;
    this.state = { platform: this.platform, status: 'disconnected' };
    this.credentialFile = join(input.root, 'credentials.json');
  }

  private get managedLogin(): boolean {
    return this.platform === 'youtube' && (this.input.osPlatform ?? process.platform) === 'win32';
  }

  async initialize(): Promise<void> {
    await mkdir(this.input.root, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(this.input.root, 0o700);
    for (const entry of await readdir(this.input.root)) {
      if (/^(?:login-|task-)/.test(entry)) await rm(join(this.input.root, entry), { recursive: true, force: true });
    }
    await this.refreshState();
  }
  async getState(): Promise<ConnectionState<P>> {
    if (!this.attempt && this.state.status !== 'error') await this.refreshState();
    return this.publicState();
  }
  async hasAuthentication(): Promise<boolean> {
    const credential = await this.readCredential();
    return !!credential && !credential.invalidated && hasPlatformSession(filterPlatformCookies(credential.cookies, this.platform), this.platform);
  }
  connect(profileId?: string): Promise<ConnectionState<P>> {
    return this.serialize(async () => {
      if (this.attempt) return this.publicState();
      if (this.managedLogin) {
        if (await this.hasAuthentication()) { await this.refreshState(); return this.publicState(); }
        const attempt: ConnectionAttempt = { controller: new AbortController(), work: Promise.resolve() };
        this.attempt = attempt;
        this.state = { platform: this.platform, status: 'connecting', message: '正在打开 YouTube 登录窗口' };
        attempt.work = this.finishConnection(attempt);
        return this.publicState();
      }
      const profiles = await (this.input.listProfiles ?? listBrowserProfiles)();
      const profile = profileId ? profiles.find(p => p.id === profileId) : profiles[0];
      if (!profile) {
        this.state = { platform: this.platform, status: 'error', message: this.platform === 'youtube'
          ? '未找到可用的浏览器账号，请先在 Chrome 或 Edge 中登录 YouTube。'
          : '未找到可用的浏览器账号，请先在 Chrome 或 Edge 中打开抖音并完成网页验证。' };
        return this.publicState();
      }
      const attempt = { controller: new AbortController(), work: Promise.resolve() };
      this.attempt = attempt;
      this.state = { platform: this.platform, status: 'connecting', browser: profile.browser, profileId: profile.id };
      attempt.work = this.finishConnection(attempt, profile);
      return this.publicState();
    });
  }
  completeLogin(): Promise<ConnectionState<P>> {
    return this.serialize(async () => {
      if (this.attempt?.completeLogin) {
        this.attempt.completeLogin();
        this.state = { platform: this.platform, status: 'connecting', browser: 'chrome', message: '正在保存 YouTube 登录态' };
      }
      return this.publicState();
    });
  }
  cancel(): Promise<ConnectionState<P>> {
    return this.serialize(async () => { await this.stopConnection(); await this.refreshState(); return this.publicState(); });
  }
  disconnect(): Promise<ConnectionState<P>> {
    return this.serialize(async () => {
      await this.stopConnection();
      await rm(this.credentialFile, { force: true });
      if (this.managedLogin) {
        for (const browser of ['chrome', 'edge']) {
          await rm(join(this.input.root, `browser-${browser}`), { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        }
      }
      this.state = { platform: this.platform, status: 'disconnected' };
      return this.publicState();
    });
  }
  importCookies(source: string): Promise<ConnectionState<P>> {
    return this.serialize(async () => {
      const cookies = parsePlatformCookies(source, this.platform);
      if (!hasPlatformSession(cookies, this.platform)) throw new Error(this.platform === 'youtube'
        ? 'Cookie 文件中没有有效的 YouTube 登录态。' : 'Cookie 文件中没有有效的抖音会话。');
      await this.stopConnection();
      await writePrivateJsonFile(this.credentialFile, { version: 1, cookies, connectedAt: new Date().toISOString() } satisfies Credential);
      await this.refreshState();
      return this.publicState();
    });
  }
  authenticatedRuntime(runtime: YtDlpRuntime | undefined): YtDlpRuntime | undefined {
    const context = this.context.getStore();
    return runtime && context ? { ...runtime, prefixArgs: [...runtime.prefixArgs, '--cookies', context.path] } : runtime;
  }
  async withCookies<T>(operation: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return operation();
    // Browser reads can prompt for keychain access. Only explicit connections
    // refresh the saved credential; background requests and tasks use snapshots.
    const credential = await this.readCredential();
    const cookies = filterPlatformCookies(credential?.cookies, this.platform);
    if (!credential || credential.invalidated || !hasPlatformSession(cookies, this.platform)) return operation();
    const directory = await mkdtemp(join(this.input.root, 'task-'));
    if (process.platform !== 'win32') await chmod(directory, 0o700);
    const path = join(directory, 'cookies.txt');
    try {
      await writeFile(path, serializePlatformCookies(cookies, this.platform), { mode: 0o600, flag: 'wx' });
      return await this.context.run({ path, credential }, operation);
    } catch (error) {
      // A media 403 or bot challenge alone is not proof that the account expired.
      if (error instanceof Error && /cookies (?:are )?no longer valid|cookies? (?:have |has )?expired/i.test(error.message)) {
        await this.serialize(async () => {
          const current = await this.readCredential();
          if (current?.connectedAt === credential.connectedAt) {
            await writePrivateJsonFile(this.credentialFile, { ...current, invalidated: true });
            await this.refreshState();
          }
        });
      }
      throw error;
    } finally { await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
  }
  async close(): Promise<void> { await this.serialize(() => this.stopConnection()); }
  private async finishConnection(attempt: ConnectionAttempt, profile?: BrowserProfile): Promise<void> {
    const managed = this.managedLogin;
    const timeout = setTimeout(() => attempt.controller.abort(), this.input.connectionTimeoutMs ?? (managed ? 600_000 : 120_000));
    let login: BrowserLoginSession | undefined;
    let browserClosed = false;
    try {
      if (managed) {
        login = await (this.input.openLoginBrowser ?? openWindowsYouTubeLogin)({ root: this.input.root, signal: attempt.controller.signal });
        profile = login.profile;
        let message = '请在打开的 Chrome 窗口中登录 YouTube';
        let actionRequired: 'complete-login' | 'close-login-browser' = 'complete-login';
        let watchExit = true;
        while (!browserClosed) {
          this.state = { platform: this.platform, status: 'connecting', browser: 'chrome', profileId: profile.id, message, actionRequired };
          await this.waitForLoginCompletion(attempt, login, watchExit);
          watchExit = false;
          attempt.controller.signal.throwIfAborted();
          this.state = { platform: this.platform, status: 'connecting', browser: 'chrome', profileId: profile.id, message: '正在保存 YouTube 登录态' };
          try { await login.close(attempt.controller.signal); browserClosed = true; }
          catch (error) {
            if (!(error instanceof LoginBrowserCloseError)) throw error;
            message = error.message; actionRequired = 'close-login-browser';
          }
        }
      }
      attempt.controller.signal.throwIfAborted();
      if (!profile) throw new Error('未找到可用的浏览器账号，请重新连接。');
      const cookies = filterPlatformCookies(await (this.input.readBrowserCookies ?? readBrowserPlatformCookies)({
        profile, runtime: this.input.getRuntime(), signal: attempt.controller.signal,
        ...(this.platform === 'douyin' ? { platform: 'douyin' as const } : {})
      }), this.platform);
      attempt.controller.signal.throwIfAborted();
      if (!hasPlatformSession(cookies, this.platform)) throw new Error(managed
        ? '尚未完成 YouTube 登录，请重新连接并在登录窗口中完成登录。'
        : this.platform === 'youtube'
        ? '此浏览器账号尚未登录 YouTube，或登录已过期。请在该账号中登录后重新连接。'
        : '此浏览器账号没有有效的抖音会话，请先打开抖音视频并完成网页验证后重新连接。');
      const connectedAt = new Date().toISOString();
      await writePrivateJsonFile(this.credentialFile, {
        version: 1, cookies, connectedAt, browser: profile.browser, profileId: profile.id
      } satisfies Credential);
      this.state = { platform: this.platform, status: 'connected', connectedAt, browser: profile.browser, profileId: profile.id };
    } catch (error) {
      this.state = { platform: this.platform, status: 'error', browser: profile?.browser, profileId: profile?.id,
        message: attempt.controller.signal.aborted ? '连接已取消或超时，请重新连接。' : publicConnectionError(error) };
    } finally {
      clearTimeout(timeout);
      if (login) {
        if (!browserClosed) await login.close(AbortSignal.timeout(12_000)).catch(() => undefined);
        await login.dispose().catch(() => undefined);
      }
      if (this.attempt === attempt) this.attempt = undefined;
    }
  }
  private waitForLoginCompletion(attempt: ConnectionAttempt, login: BrowserLoginSession, watchExit: boolean): Promise<void> {
    const signal = attempt.controller.signal;
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        if (attempt.completeLogin === complete) attempt.completeLogin = undefined;
      };
      const complete = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal.reason); };
      attempt.completeLogin = complete;
      signal.addEventListener('abort', abort, { once: true });
      if (watchExit) void login.exited.then(complete);
    });
  }
  private async stopConnection(): Promise<void> {
    const attempt = this.attempt;
    if (!attempt) return;
    attempt.controller.abort();
    await attempt.work;
    if (this.attempt === attempt) this.attempt = undefined;
  }
  private async readCredential(): Promise<Credential | undefined> {
    const raw = await readPrivateJsonFile(this.credentialFile);
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Partial<Credential>;
    if (value.version !== 1 || !Array.isArray(value.cookies) || typeof value.connectedAt !== 'string') return undefined;
    return value as Credential;
  }
  private async refreshState(): Promise<void> {
    const credential = await this.readCredential();
    this.state = credential ? {
      platform: this.platform, status: !credential.invalidated && hasPlatformSession(filterPlatformCookies(credential.cookies, this.platform), this.platform) ? 'connected' : 'expired',
      connectedAt: credential.connectedAt, browser: credential.browser, profileId: credential.profileId
    } : { platform: this.platform, status: 'disconnected' };
  }
  private async publicState(): Promise<ConnectionState<P>> {
    if (this.managedLogin) return { ...this.state, connectionMethod: 'browser-login' };
    const profiles = await (this.input.listProfiles ?? listBrowserProfiles)();
    return { ...this.state, profiles: profiles.map(({ id, browser, label }) => ({ id, browser, label })) };
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const work = this.mutations.then(operation);
    this.mutations = work.catch(() => undefined);
    return work;
  }
}
function publicConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[\u4e00-\u9fff]/.test(message) ? message : '读取浏览器登录态失败，请重试或选择其他浏览器账号。';
}
