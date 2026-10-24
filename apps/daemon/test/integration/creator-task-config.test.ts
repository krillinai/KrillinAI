import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { createGatewayConfigStore } from '../../src/gateway/config-store.js';

it.each([false, true])('starts a task-selected text model with no global text default (previous config error: %s)', async recover => {
  const root = await mkdtemp(join(tmpdir(), 'creator-task-config-'));
  const models = [
    { catalogSchema: 2, id: 'oc_1111111111111111', name: 'grok-4.7', modality: 'text', capabilities: ['chat', 'responses'], status: 'temporarily_unavailable', statusReason: 'price_review' },
    { catalogSchema: 2, id: 'oc_b093cbfcc00519d1', name: 'deepseek-v4-pro', modality: 'text', capabilities: ['chat', 'responses'], status: 'ready' }
  ];
  const defaults = { text: models[0]!.id };
  const requests: string[] = [];
  let origin = '';
  const bootstrap = () => ({ schemaVersion: 3 as const, transport: 'gateway' as const,
    supplier: 'chatanywhere' as const, keyRotation: false,
    account: { id: 'account', email: 'task@example.test', verified: true },
    bindingVersion: 'account:gateway:1', keyVersion: '1', baseUrl: `${origin}/v1`, models, defaults });
  const gateway = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    if (request.url?.startsWith('/api/v1/client/bootstrap')) {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(bootstrap()));
    } else if (request.url?.startsWith('/api/v1/client/models')) {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ models, defaults }));
    } else if (request.url === '/api/v1/me') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(bootstrap().account));
    } else {
      response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'unexpected_test_request' } }));
    }
  });
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  const run = vi.fn(async () => ({ outputs: [] }));
  try {
    await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
    const address = gateway.address();
    if (!address || typeof address === 'string') throw new Error('Missing mock gateway address');
    origin = `http://127.0.0.1:${address.port}`;
    const dataDir = join(root, 'data');
    await createGatewayConfigStore(dataDir).writeCredentials({ ...bootstrap(), models: [], defaults: {},
      accessToken: 'test-access-token', refreshToken: 'test-refresh-token', expiresIn: 900,
      accessExpiresAt: new Date(Date.now() + 900_000).toISOString() });
    server = await buildServer({ token: 'local-token', appHome: root, dataDir,
      codexHome: join(root, 'codex'), localCodexHome: join(root, 'codex'),
      defaultCwd: root, defaultProjectRoot: join(root, 'projects'), gatewayOrigin: origin,
      creatorExecutors: [{ id: 'krillinai', run }], schedulerAutostart: false });
    await server.listen({ host: '127.0.0.1', port: 0 });
    const request = (method: 'GET' | 'POST', url: string, payload?: object) => server!.inject({
      method, url, headers: { authorization: 'Bearer local-token' }, ...(payload ? { payload } : {})
    });
    await vi.waitFor(async () => {
      expect((await request('GET', '/gateway/account')).json()).toMatchObject({ activationState: 'ready', selectedModels: {} });
    });
    const created = await request('POST', '/creator/jobs', { projectId: 'project', templateId: 'video-translation', state: {
      sourceType: 'url', sourceUrl: 'https://youtu.be/task-config', sourceLanguage: 'en', targetLanguage: 'zh_cn',
      dubbing: false, composeVideo: false,
      ...(!recover ? { officialModels: { text: models[1]!.id } } : {})
    } });
    expect(created.statusCode).toBe(201);
    let job = created.json().job;
    if (recover) {
      const missing = await request('POST', `/creator/jobs/${job.id}/actions`, {
        action: 'run-stage', expectedRevision: job.revision, input: { stageId: 'subtitle' }
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error.code).toBe('creator_llm_config_missing');
      job = (await request('GET', `/creator/jobs/${job.id}`)).json().job;
      expect(job).toMatchObject({ status: 'needs_input', stages: [] });
      const updated = await request('POST', `/creator/jobs/${job.id}/actions`, {
        action: 'update-settings', expectedRevision: job.revision,
        input: { patch: { officialModels: { text: models[1]!.id } } }
      });
      expect(updated.statusCode).toBe(200);
      job = updated.json().job;
    }
    const preflight = await request('GET', `/creator/jobs/${job.id}/preflight?stageId=subtitle`);
    expect(preflight.statusCode).toBe(200);
    expect(preflight.json()).toMatchObject({ canStart: true, blocked: [] });
    const started = await request('POST', `/creator/jobs/${job.id}/actions`, {
      action: 'run-stage', expectedRevision: job.revision, input: { stageId: 'subtitle' }
    });
    expect(started.statusCode, started.body).toBe(200);
    await vi.waitFor(async () => {
      const completed = (await request('GET', `/creator/jobs/${job.id}`)).json().job;
      expect(completed.stages)
        .toEqual([expect.objectContaining({ stageId: 'subtitle', status: 'succeeded' })]);
      expect(completed.state.needsInput).toBeUndefined();
    });
    expect(run).toHaveBeenCalledOnce();
    expect((await request('GET', '/gateway/account')).json().selectedModels).toEqual({});
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(path => path.startsWith('GET /api/v1/client/') || path === 'GET /api/v1/me'), JSON.stringify(requests)).toBe(true);
  } finally {
    await server?.close();
    gateway.closeAllConnections();
    await new Promise<void>(resolve => gateway.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
