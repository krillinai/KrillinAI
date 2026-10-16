import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { createGatewayConfigStore } from '../../src/gateway/config-store.js';
import type { SchedulerService } from '../../src/scheduler/service.js';

it.each([true, false])('网关请求未完成时本地服务已可用，调度等待恢复且关闭会取消恢复（提前关闭=%s）', async closeWhileRestoring => {
  const root = await mkdtemp(join(tmpdir(), 'oc-gateway-startup-'));
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let bootstrapStarted = false;
  let bootstrapCanceled = false;
  const gateway = createServer(async (_request, response) => {
    bootstrapStarted = true;
    response.once('close', () => { bootstrapCanceled = true; });
    await waiting;
    if (!response.destroyed) response.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'gateway_unavailable' } }));
  });
  await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const address = gateway.address();
  if (!address || typeof address === 'string') throw new Error('Missing gateway address');
  const origin = `http://127.0.0.1:${address.port}`;
  const dataDir = join(root, 'data');
  await createGatewayConfigStore(dataDir).writeCredentials({
    schemaVersion: 1, account: { id: 'a', email: 'a@example.test', verified: true },
    accessToken: 'private-access-token', refreshToken: 'private-refresh-token',
    expiresIn: 900, accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    modelKey: 'private-model-key', keyVersion: '1', bindingVersion: 'a:1', baseUrl: `${origin}/v1`,
    models: [{ id: 'official-model', modality: 'text', capabilities: ['responses'] }], defaults: { text: 'official-model' }
  });
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  const start = vi.fn();
  const stop = vi.fn();
  const scheduler = { start, stop, refreshTimer: vi.fn() } as unknown as SchedulerService;
  try {
    server = await buildServer({ token: 'local-runtime-token', appHome: root, dataDir,
      codexHome: join(root, 'codex'), localCodexHome: join(root, 'codex'),
      defaultCwd: root, defaultProjectRoot: join(root, 'projects'), gatewayOrigin: origin,
      creatorExecutors: [], schedulerAutostart: true, scheduler
    });
    expect(bootstrapStarted).toBe(false);
    expect(start).not.toHaveBeenCalled();
    await server.listen({ host: '127.0.0.1', port: 0 });
    await expect.poll(() => bootstrapStarted).toBe(true);
    expect((await server.inject('/healthz')).json()).toEqual({ ok: true });
    const state = await server.inject({ method: 'GET', url: '/gateway/account', headers: { authorization: 'Bearer local-runtime-token' } });
    expect(state.json()).toMatchObject({ source: 'gateway', authState: 'signed_in', activationState: 'loading', account: { id: 'a' } });
    expect(state.body).not.toContain('private-');
    expect(start).not.toHaveBeenCalled();
    if (!closeWhileRestoring) {
      release();
      await expect.poll(() => start.mock.calls.length).toBe(1);
      expect((await server.inject({ url: '/gateway/account', headers: { authorization: 'Bearer local-runtime-token' } })).json())
        .toMatchObject({ authState: 'signed_in', activationState: 'blocked' });
    }
    await server.close();
    await expect.poll(() => bootstrapCanceled).toBe(true);
    expect(start).toHaveBeenCalledTimes(closeWhileRestoring ? 0 : 1);
    expect(stop).toHaveBeenCalled();
  } finally {
    release();
    await server?.close();
    gateway.closeAllConnections();
    await new Promise<void>(resolve => gateway.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
