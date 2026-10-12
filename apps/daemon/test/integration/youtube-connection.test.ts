import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { YouTubeConnectionService } from '../../src/platform-connections/youtube.js';
import { filterYouTubeCookies, hasYouTubeAuthentication, parseYouTubeCookies, serializeYouTubeCookies } from '../../src/platform-connections/cookies.js';
import { registerPlatformConnectionRoutes } from '../../src/api/routes.platform-connections.js';
import { requireAuth } from '../../src/api/auth.js';
import type { BrowserProfile, readBrowserYouTubeCookies } from '../../src/platform-connections/browser.js';
import type { YtDlpRuntime } from '../../src/creator/yt-dlp/runtime.js';

const cookies = ['SID', 'SAPISID'].map(name => ({ name, value: `secret-${name}`, domain: '.youtube.com',
  path: '/', secure: true, httpOnly: true, expires: Date.now() / 1000 + 3600 }));
const roots: string[] = [];
const services: YouTubeConnectionService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const profile: BrowserProfile = { id: 'a'.repeat(24), browser: 'chrome', label: 'Chrome · Test', directory: '/test/profile', preferred: true };
async function setup(readBrowserCookies?: typeof readBrowserYouTubeCookies) {
  const root = await mkdtemp(join(tmpdir(), 'youtube-connection-'));
  roots.push(root);
  const service = new YouTubeConnectionService({ root, getRuntime: () => runtime, listProfiles: async () => [profile], readBrowserCookies });
  services.push(service);
  await service.initialize();
  return { root, service };
}
const runtime: YtDlpRuntime = { executable: '/yt-dlp', prefixArgs: ['--js-runtimes', 'node:/node'], version: 'test', env: {} };

it('exports only valid YouTube cookies including HttpOnly, and rejects malicious cookie fields', () => {
  const filtered = filterYouTubeCookies([...cookies,
    { ...cookies[0], domain: '.google.com' }, { ...cookies[0], domain: '.youtube.com.evil.test' },
    { ...cookies[0], value: 'injection\n.example.com' }, { ...cookies[0], expires: 1 }]);
  expect(filtered).toEqual(cookies);
  const text = serializeYouTubeCookies(filtered);
  expect(text).toContain('#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t');
  expect(parseYouTubeCookies(text)).toEqual(cookies.map(c => ({ ...c, expires: Math.floor(c.expires) })));
  expect(parseYouTubeCookies(text.replace('# Netscape HTTP Cookie File', '# HTTP Cookie File'))).toHaveLength(2);
  expect(() => parseYouTubeCookies(JSON.stringify(cookies))).toThrow();
  expect(hasYouTubeAuthentication(filterYouTubeCookies([{ ...cookies[0], expires: 1 }]))).toBe(false);
});

it('keeps task snapshots isolated, preserves an active task on disconnect, and cleans files on success/failure', async () => {
  const { root, service } = await setup();
  await service.importCookies(serializeYouTubeCookies(cookies));
  const paths: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = service.withCookies(async () => {
    const path = service.authenticatedRuntime(runtime)!.prefixArgs.at(-1)!;
    paths.push(path);
    expect(await readFile(path, 'utf8')).toContain('secret-SID');
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
    await gate;
    await access(path);
  });
  await vi.waitFor(() => expect(paths).toHaveLength(1));
  await expect(service.withCookies(async () => {
    const path = service.authenticatedRuntime(runtime)!.prefixArgs.at(-1)!;
    paths.push(path);
    throw new Error('download failed');
  })).rejects.toThrow('download failed');
  expect(paths[0]).not.toBe(paths[1]);
  await expect(access(paths[1]!)).rejects.toThrow();
  await service.disconnect();
  expect(service.authenticatedRuntime(runtime)).toBe(runtime);
  release(); await first;
  await expect(access(paths[0]!)).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  expect((await service.getState()).status).toBe('disconnected');
});

it('automatically reads the selected browser profile without returning cookie secrets or its filesystem path', async () => {
  let finish!: (value: typeof cookies) => void;
  const read = vi.fn(() => new Promise<typeof cookies>(resolve => { finish = resolve; }));
  const { root, service } = await setup(read);
  expect((await service.connect()).status).toBe('connecting');
  await service.connect(); expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(expect.objectContaining({ profile }));
  finish(cookies);
  await vi.waitFor(async () => expect((await service.getState()).status).toBe('connected'));
  const publicState = JSON.stringify(await service.getState());
  expect(publicState).not.toMatch(/secret|SID|cookies|credentials|\/test\/profile/);
  if (process.platform !== 'win32') expect((await stat(join(root, 'credentials.json'))).mode & 0o777).toBe(0o600);
});

it('cancels an in-progress import and preserves the previous credential', async () => {
  const read: typeof readBrowserYouTubeCookies = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true });
  });
  const { root, service } = await setup(read);
  await service.importCookies(serializeYouTubeCookies(cookies));
  const before = await readFile(join(root, 'credentials.json'), 'utf8');
  await service.connect();
  expect((await service.cancel()).status).toBe('connected');
  expect(await readFile(join(root, 'credentials.json'), 'utf8')).toBe(before);
});

it('requires Runtime auth and returns only public connection state through the API', async () => {
  const { service } = await setup();
  const server = Fastify(); server.addHook('onRequest', requireAuth('runtime-token'));
  await registerPlatformConnectionRoutes(server, service);
  try {
    expect((await server.inject({ method: 'POST', url: '/platform-connections/youtube/import', payload: { cookies: serializeYouTubeCookies(cookies) } })).statusCode).toBe(401);
    const response = await server.inject({ method: 'POST', url: '/platform-connections/youtube/import',
      headers: { authorization: 'Bearer runtime-token' }, payload: { cookies: serializeYouTubeCookies(cookies) } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().status).toBe('connected');
    expect(response.body).not.toMatch(/secret|SID|cookies/);
  } finally { await server.close(); }
});

it('marks explicit cookie expiry and preserves the connection on a media 403', async () => {
  const { service } = await setup();
  await service.importCookies(serializeYouTubeCookies(cookies));
  await expect(service.withCookies(async () => { throw new Error('HTTP Error 403: Forbidden'); })).rejects.toThrow('403');
  expect((await service.getState()).status).toBe('connected');
  await expect(service.withCookies(async () => { throw new Error('The cookies are no longer valid'); })).rejects.toThrow('no longer valid');
  expect((await service.getState()).status).toBe('expired');
  await service.withCookies(async () => expect(service.authenticatedRuntime(runtime)).toBe(runtime));
});

it('reuses saved browser cookies for polling, concurrent tasks, nested requests and app restarts without keychain reads', async () => {
  const read = vi.fn(async () => cookies);
  const { root, service } = await setup(read);
  await service.connect();
  await vi.waitFor(async () => expect((await service.getState()).status).toBe('connected'));

  async function useSavedCookies(connection: YouTubeConnectionService) {
    expect((await connection.getState()).status).toBe('connected');
    expect(await connection.hasAuthentication()).toBe(true);
    await connection.withCookies(async () => {
      const path = connection.authenticatedRuntime(runtime)!.prefixArgs.at(-1)!;
      expect(await readFile(path, 'utf8')).toContain('secret-SID');
      await connection.withCookies(async () => {
        expect(connection.authenticatedRuntime(runtime)!.prefixArgs.at(-1)).toBe(path);
      });
    });
  }
  await Promise.all(Array.from({ length: 5 }, () => useSavedCookies(service)));
  expect(read).toHaveBeenCalledTimes(1);

  const restarted = new YouTubeConnectionService({ root, getRuntime: () => runtime,
    listProfiles: async () => [profile], readBrowserCookies: read });
  services.push(restarted);
  await restarted.initialize();
  await useSavedCookies(restarted);
  expect(read).toHaveBeenCalledTimes(1);
});

it('requires an explicit reconnect to refresh expired browser cookies without automatic keychain prompts', async () => {
  const read = vi.fn(async () => cookies);
  const { service } = await setup(read);
  await service.connect();
  await vi.waitFor(async () => expect((await service.getState()).status).toBe('connected'));
  await expect(service.withCookies(async () => { throw new Error('The cookies are no longer valid'); }))
    .rejects.toThrow('no longer valid');
  expect((await service.getState()).status).toBe('expired');
  expect(await service.hasAuthentication()).toBe(false);
  await service.withCookies(async () => expect(service.authenticatedRuntime(runtime)).toBe(runtime));
  expect(read).toHaveBeenCalledTimes(1);

  read.mockResolvedValue(cookies.map(cookie => ({ ...cookie, value: `fresh-${cookie.name}` })));
  await service.connect(profile.id);
  await vi.waitFor(async () => expect((await service.getState()).status).toBe('connected'));
  await service.withCookies(async () => {
    const path = service.authenticatedRuntime(runtime)!.prefixArgs.at(-1)!;
    expect(await readFile(path, 'utf8')).toContain('fresh-SID');
  });
  expect(read).toHaveBeenCalledTimes(2);
});
