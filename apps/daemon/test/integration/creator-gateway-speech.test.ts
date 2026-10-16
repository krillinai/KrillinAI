import Fastify from 'fastify';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRuntimeDatabase } from '../../src/storage/database.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import { CreatorProviderRequestLedger } from '../../src/creator/provider-requests.js';
import { createGatewayCreatorSource } from '../../src/gateway/creator-service-source.js';
import { resolveGatewaySpeech } from '../../src/gateway/speech-response.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture(fetcher: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), 'oc-gateway-speech-'));
  const db = openRuntimeDatabase(join(root, 'runtime.sqlite'));
  const repository = createCreatorRepository(db);
  const job = repository.createJob({ projectId: 'project', templateId: 'video-translation', templateVersion: 1, status: 'running', state: {} });
  const stage = repository.createStageRun({ jobId: job.id, stageId: 'tts', executor: 'krillin', status: 'running' });
  const ledger = new CreatorProviderRequestLedger(repository);
  const manual = createDefaultCreatorServicesConfig();
  const source = createGatewayCreatorSource({ ledger, readStageRun: repository.getStageRun,
    readJobBinding: () => ({ source: 'gateway', accountId: 'a', bindingVersion: 'a:1', models: { speech: 'speech' }, capabilities: { speech: ['tts'] } }),
    account: {
      peekState: () => ({ source: 'gateway', transport: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: 'a:1', models: [], activationError: null }),
      modelCredentials: async () => ({ accountId: 'a', transport: 'gateway', modelKey: 'cloud-secret', keyVersion: '1', bindingVersion: 'a:1', baseUrl: 'https://gateway.example/v1', defaults: { speech: 'speech' }, models: [] })
    },
    manual: { read: async () => manual, write: async c => c, reset: async () => manual },
    getLocalOrigin: () => 'http://127.0.0.1:39999', fetcher
  });
  const server = Fastify();
  await source.register(server);
  cleanup.push(async () => { await source.revoke(); await server.close(); db.close(); await rm(root, { recursive: true, force: true }); });
  const synthesize = (stageId = stage.id) => source.runForJob(job.id, stageId, async () => {
    const config = await source.store.read();
    return server.inject({ method: 'POST', url: '/internal/krillin-llm/gateway/v1/audio/speech',
      headers: { Authorization: `Bearer ${config.tts.openai.apiKey}` }, payload: { model: 'speech', voice: 'marin', input: 'Hello', response_format: 'wav' } });
  });
  return { repository, ledger, job, stage, synthesize };
}

it('waits for an accepted speech request and reuses its audio across stage retries', async () => {
  const requestId = 'ocreq_accepted_speech';
  let statusQueries = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer cloud-secret');
    if (options?.method === 'POST') return Response.json({ requestId, state: 'submitting', billingState: 'reserved' }, { status: 202, headers: { 'X-Request-ID': requestId } });
    if (String(url).endsWith('/result')) return new Response('RIFF-test-audio', { headers: { 'Content-Type': 'audio/wav' } });
    return Response.json({ requestId, state: ++statusQueries === 1 ? 'waiting_upstream' : 'succeeded' });
  });
  const f = await fixture(fetcher);
  const response = await f.synthesize();
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toBe('audio/wav');
  expect(response.headers['x-request-id']).toBe(requestId);
  expect(response.body).toBe('RIFF-test-audio');
  expect(f.repository.listProviderRequests(f.job.id)).toEqual([expect.objectContaining({ status: 'succeeded', remoteTaskId: requestId })]);
  const retry = f.repository.createStageRun({ jobId: f.job.id, stageId: 'tts', executor: 'krillin', status: 'running', progress: { resumedFromStageRunId: f.stage.id } });
  expect((await f.synthesize(retry.id)).body).toBe('RIFF-test-audio');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/result'))).toHaveLength(2);
});

it.each(['failed', 'canceled', 'outcome_unknown'] as const)('preserves the speech receipt when the gateway reports %s', async state => {
  const requestId = 'ocreq_terminal_speech';
  const fetcher = vi.fn<typeof fetch>(async (_url, options) => options?.method === 'POST'
    ? Response.json({ requestId, state }, { status: 202, headers: { 'X-Request-ID': requestId } })
    : Response.json({ requestId, state }));
  const f = await fixture(fetcher);
  expect((await f.synthesize()).statusCode).toBe(state === 'outcome_unknown' ? 409 : 502);
  expect(f.repository.listProviderRequests(f.job.id)).toEqual([expect.objectContaining({ remoteTaskId: requestId,
    status: state === 'outcome_unknown' ? 'unknown_remote_acceptance' : 'failed' })]);
  await f.synthesize();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/result'))).toBe(false);
});

it('cancels speech polling without another submission', async () => {
  const controller = new AbortController();
  const request = vi.fn();
  await expect(resolveGatewaySpeech({ response: Response.json({ requestId: 'ocreq_canceled_speech', state: 'submitting' }, { status: 202 }),
    signal: controller.signal, request, onReceipt: async () => { controller.abort(); }
  })).rejects.toMatchObject({ name: 'AbortError' });
  expect(request).not.toHaveBeenCalled();
});

it('recovers an uncertain speech outcome by querying the original request', async () => {
  const requestId = 'ocreq_recovered_speech';
  let state = 'outcome_unknown';
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url).endsWith('/result')) return new Response('RIFF-recovered-audio', { headers: { 'Content-Type': 'audio/wav' } });
    return Response.json({ requestId, state }, { status: options?.method === 'POST' ? 202 : 200 });
  });
  const f = await fixture(fetcher);
  expect((await f.synthesize()).statusCode).toBe(409);
  state = 'succeeded';
  const retry = f.repository.createStageRun({ jobId: f.job.id, stageId: 'tts', executor: 'krillin', status: 'running', progress: { resumedFromStageRunId: f.stage.id } });
  const response = await f.synthesize(retry.id);
  expect(response.statusCode).toBe(200);
  expect(response.body).toBe('RIFF-recovered-audio');
  expect(f.repository.listProviderRequests(f.job.id)[0]?.status).toBe('succeeded');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('rejects mismatched receipts and JSON masquerading as speech audio', async () => {
  const requestId = 'ocreq_valid_speech';
  const request = vi.fn();
  await expect(resolveGatewaySpeech({ response: Response.json({ requestId, state: 'succeeded' }, { status: 202, headers: { 'X-Request-ID': 'ocreq_unrelated_speech' } }),
    signal: new AbortController().signal, request, onReceipt: async () => {}
  })).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue(Response.json({ requestId, state: 'submitting' }));
  await expect(resolveGatewaySpeech({ response: Response.json({ requestId, state: 'succeeded' }, { status: 202 }),
    signal: new AbortController().signal, request, onReceipt: async () => {}
  })).rejects.toMatchObject({ code: 'request_outcome_unknown' });
});
