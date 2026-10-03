import Fastify, { type FastifyInstance } from 'fastify';
import { createDefaultCreatorServicesConfig, type CreatorRuntimeComponent, type CreatorYtDlpStatus } from '@opencreator/protocol';
import { createKrillinDependencyLoader } from '../../src/creator/krillin/dependency-loader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCreatorRuntimeRoutes } from '../../src/api/routes.creator-runtime.js';
import {
  YtDlpUpdateError,
  type YtDlpUpdateManager
} from '../../src/creator/yt-dlp/update-manager.js';

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('creator yt-dlp runtime routes', () => {
  it('includes and downloads Remotion through the shared component API without changing transcription', async () => {
    const config = createDefaultCreatorServicesConfig();
    const component: CreatorRuntimeComponent = { id: 'remotion', name: 'Remotion', available: true, version: null, supportedVersion: '4.0.473', installedAt: null, path: '/runtime/remotion', source: 'verified release', models: [], model: null, state: 'not_installed', item: null, downloadedBytes: 0, totalBytes: null, percent: null, bytesPerSecond: null, remainingSeconds: null, error: null };
    const remotion = { status: vi.fn(async () => component), download: vi.fn(async () => component), ensure: vi.fn(), close: vi.fn() };
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-remotion-api', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => false, install: vi.fn() } });
    const download = vi.spyOn(loader, 'download');
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined, { loader, readConfig: async () => config, remotion });
    const before = await server.inject({ method: 'GET', url: '/creator/components/status' });
    expect(before.json().components).toContainEqual(component);
    expect(remotion.download).not.toHaveBeenCalled();
    const response = await server.inject({ method: 'POST', url: '/creator/components/download', payload: { componentId: 'remotion' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().selectedProvider).toBe('openai');
    expect(remotion.download).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(config.transcription.provider).toBe('openai');
  });

  it('downloads the requested component without changing the saved cloud provider', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'openai';
    const saved = structuredClone(config);
    let installed = false;
    const install = vi.fn(async () => { installed = true; });
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-independent-components-route', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => installed, install } });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined, { loader, readConfig: async () => config });

    const download = await server.inject({ method: 'POST', url: '/creator/components/download', payload: { componentId: 'whisperkit' } });

    expect(download.statusCode).toBe(200);
    expect(download.json()).toMatchObject({ selectedProvider: 'openai', selectedModel: null });
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce());
    const after = await server.inject({ method: 'GET', url: '/creator/components/status' });
    expect(after.json()).toMatchObject({ selectedProvider: 'openai', components: expect.arrayContaining([expect.objectContaining({ id: 'whisperkit', state: 'ready' })]) });
    expect(config).toEqual(saved);
  });

  it.each([{ componentId: 'openai' }, { componentId: 123 }, { componentId: null }, ['whisperkit']])('rejects an invalid component request %j without downloading', async payload => {
    const install = vi.fn();
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-invalid-components-route', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => false, install } });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined, { loader, readConfig: async () => createDefaultCreatorServicesConfig() });

    const response = await server.inject({ method: 'POST', url: '/creator/components/download', payload });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'creator_component_download_unavailable' } });
    expect(install).not.toHaveBeenCalled();
  });

  it('rejects components unsupported by the Runtime platform even with a cloud provider', async () => {
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-unsupported-components-route', platform: 'linux', arch: 'x64' });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined, { loader, readConfig: async () => createDefaultCreatorServicesConfig() });

    const response = await server.inject({ method: 'POST', url: '/creator/components/download', payload: { componentId: 'whisperkit' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'creator_component_download_unavailable', message: expect.stringContaining('unavailable on this platform') } });
  });

  it('reports local engine inventory and starts downloads independently of yt-dlp', async () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisperkit';
    let installed = false;
    const install = vi.fn(async () => { installed = true; });
    const loader = createKrillinDependencyLoader({ root: '/tmp/opencreator-components-route', platform: 'darwin', arch: 'arm64', whisperKitInstaller: { isInstalled: async () => installed, install } });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined, { loader, readConfig: async () => config });
    const before = await server.inject({ method: 'GET', url: '/creator/components/status' });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ selectedProvider: 'whisperkit', selectedModel: 'large-v2', components: expect.arrayContaining([expect.objectContaining({ id: 'whisperkit', state: 'not_installed' })]) });
    const download = await server.inject({ method: 'POST', url: '/creator/components/download' });
    expect(download.statusCode).toBe(200);
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce());
    const after = await server.inject({ method: 'GET', url: '/creator/components/status' });
    expect(after.json().components.find((component: { id: string }) => component.id === 'whisperkit').state).toBe('ready');
  });
  it('exposes status, periodic checks, and manual updates', async () => {
    const current = status();
    const checked = status({
      latestVersion: '2026.08.31.120000',
      updateAvailable: true
    });
    const updated = status({
      source: 'managed',
      currentVersion: '2026.08.31.120000',
      latestVersion: '2026.08.31.120000',
      installedAt: '2026-08-31T00:00:00.000Z'
    });
    const manager = managerFixture({
      status: vi.fn(() => current),
      check: vi.fn(async () => checked),
      update: vi.fn(async () => updated)
    });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, manager);

    const statusResponse = await server.inject({
      method: 'GET',
      url: '/creator/yt-dlp/status'
    });
    const checkResponse = await server.inject({
      method: 'POST',
      url: '/creator/yt-dlp/check',
      payload: { force: false }
    });
    const updateResponse = await server.inject({
      method: 'POST',
      url: '/creator/yt-dlp/update'
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual({ ytDlp: current });
    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json()).toEqual({ ytDlp: checked });
    expect(manager.check).toHaveBeenCalledWith({ force: false });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({ ytDlp: updated });
    expect(manager.update).toHaveBeenCalledOnce();
  });

  it('returns stable API errors for invalid input and update failures', async () => {
    const manager = managerFixture({
      check: vi.fn(async () => {
        throw new YtDlpUpdateError(
          'creator_yt_dlp_update_check_failed',
          'release lookup failed',
          502
        );
      })
    });
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, manager);

    const invalid = await server.inject({
      method: 'POST',
      url: '/creator/yt-dlp/check',
      payload: { force: 'yes' }
    });
    const failed = await server.inject({
      method: 'POST',
      url: '/creator/yt-dlp/check',
      payload: { force: true }
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: 'creator_yt_dlp_update_check_failed' }
    });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({
      error: {
        code: 'creator_yt_dlp_update_check_failed',
        message: 'release lookup failed'
      }
    });
  });

  it('reports when the packaged runtime cannot support managed updates', async () => {
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, undefined);

    const response = await server.inject({
      method: 'GET',
      url: '/creator/yt-dlp/status'
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'creator_yt_dlp_update_unavailable' }
    });
  });

  it('closes the update manager before waiting for active requests', async () => {
    const manager = managerFixture();
    server = Fastify();
    await registerCreatorRuntimeRoutes(server, manager);

    await server.close();
    server = undefined;

    expect(manager.close).toHaveBeenCalledOnce();
  });
});

function managerFixture(
  patch: Partial<YtDlpUpdateManager> = {}
): YtDlpUpdateManager {
  return {
    getRuntime: vi.fn(() => ({
      version: '2026.08.29.232711',
      executable: process.execPath,
      prefixArgs: [],
      env: {}
    })),
    status: vi.fn(() => status()),
    check: vi.fn(async () => status()),
    update: vi.fn(async () => status()),
    close: vi.fn(),
    ...patch
  };
}

function status(
  patch: Partial<CreatorYtDlpStatus> = {}
): CreatorYtDlpStatus {
  return {
    channel: 'nightly',
    source: 'bundled',
    currentVersion: '2026.08.29.232711',
    bundledVersion: '2026.08.29.232711',
    latestVersion: null,
    updateAvailable: false,
    checkDue: false,
    lastCheckedAt: null,
    lastCheckAttemptAt: null,
    installedAt: null,
    ...patch
  };
}
