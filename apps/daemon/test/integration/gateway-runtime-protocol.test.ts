import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodexAppServerHost, type CodexAppServerHost } from '../../src/codex/app-server-host-2026-07-28.js';
import { createGatewayRuntimeBindings } from '../../src/gateway/runtime-bindings.js';
import { createDirectRuntime } from '../../src/gateway/direct-runtime.js';
import { prepareOfficialRuntimeProbe } from '../../src/gateway/runtime-probe.js';
import * as officialFetch from '../../src/gateway/official-fetch.js';
import { probeCodex } from '../../src/codex/probe.js';
import type { GatewayAccountState } from '@opencreator/protocol';

const manifest = JSON.parse(readFileSync(resolve(`../../resources/codex-runtime/${process.platform}-${process.arch}/manifest.json`), 'utf8'));
const codexBin = resolve('../../apps/desktop/.pack/codex-runtime', manifest.binary.relativePath);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
});

type ModelRequest = { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> };

async function fixture(reply: (res: ServerResponse, requests: ModelRequest[]) => void, directMode = false, supplierBase = 'https://openrouter.ai/api/v1', chatMode = false) {
  expect(existsSync(codexBin), 'bundled Runtime is required for this integration gate').toBe(true);
  expect(createHash('sha256').update(readFileSync(codexBin)).digest('hex')).toBe(manifest.binary.sha256);
  const root = mkdtempSync(join(tmpdir(), 'oc-real-gateway-'));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const requests: ModelRequest[] = [];
  const server = createServer(async (req, res) => {
    if (req.url !== (chatMode ? '/v1/chat/completions' : '/v1/responses')) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    reply(res, requests);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  const bridge = directMode ? await createDirectRuntime('test-official-key-a', async (url, options) => {
    const endpoint = chatMode ? 'chat/completions' : 'responses';
    expect(url).toBe(`${supplierBase}/${endpoint}`);
    return fetch(`http://127.0.0.1:${address.port}/v1/${endpoint}`, options);
  }, chatMode ? async () => ({ key: 'test-official-key-a', release: async () => {}, models: [{ id: 'gpt-5.2', modality: 'text', capabilities: ['responses', 'responses_via_chat'] }] }) : undefined, undefined, supplierBase) : undefined;
  if (bridge) cleanup.push(() => bridge.close());
  let host: CodexAppServerHost | undefined;
  const binding = createGatewayRuntimeBindings({
    codexHome: join(root, 'official'),
    baseUrl: bridge?.baseUrl ?? `http://127.0.0.1:${address.port}/v1`, model: 'gpt-5.2',
    readCredentials: async () => ({ accountId: 'a', modelKey: bridge?.token ?? 'test-official-key-a', keyVersion: '1' }),
    closeRuntime: async () => { await host?.close('device_logout', 100); }
  });
  cleanup.push(() => binding.close());
  vi.stubEnv('OPENAI_API_KEY', 'test-personal-key-must-not-be-used');
  const prepared = await binding.prepare();
  host = createCodexAppServerHost({
    codexBin, codexHome: prepared.codexHome, cwd: root, profile: 'default',
    baseEnvironment: prepared.env, spawnTimeoutMs: 10_000, forceKillGraceMs: 100
  });
  const run = (model = 'gpt-5.2') => host!.run({
    cwd: root, sandbox: 'danger-full-access', model,
    prompt: 'Report the current directory and then say gateway ready.', timeoutMs: 15_000
  });
  return { binding, prepared, host, requests, run, root, supplierUrl: `http://127.0.0.1:${address.port}/v1/responses` };
}

function event(res: ServerResponse, type: string, value: Record<string, unknown>) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
}

function complete(res: ServerResponse, output: Record<string, unknown>[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const response = {
    id: 'resp_test', object: 'response', created_at: 1, model: 'gpt-5.2',
    status: 'in_progress', output: [],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
  };
  event(res, 'response.created', { response });
  output.forEach((item, output_index) => {
    event(res, 'response.output_item.added', { output_index, item });
    if (item.type === 'message') {
      event(res, 'response.output_text.delta', {
        output_index, item_id: item.id, content_index: 0, delta: 'gateway ready'
      });
    }
    event(res, 'response.output_item.done', { output_index, item });
  });
  event(res, 'response.completed', { response: { ...response, status: 'completed', output } });
  res.end();
}

const message = {
  id: 'msg_test', type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'gateway ready', annotations: [] }]
};

describe('bundled Runtime official gateway boundary', () => {
  it('changes the default during a live stream without interrupting it and sends the next turn to the new model', async () => {
    let pending!: ServerResponse;
    const f = await fixture((res, requests) => {
      if (requests.length === 1) pending = res;
      else complete(res, [message]);
    });
    const first = f.run();
    const pid = f.host.pid;
    await expect.poll(() => f.requests.length, { timeout: 10_000 }).toBe(1);
    try {
      await f.binding.updateModel('gpt-4.1-mini');
      expect(f.host.pid).toBe(pid);
      expect(() => process.kill(pid!, 0)).not.toThrow();
      expect(pending.destroyed).toBe(false);
      expect(f.requests[0]!.body.model).toBe('gpt-5.2');
    } finally { complete(pending, [message]); }
    expect((await first.result).turnStatus).toBe('completed');
    expect((await f.run('gpt-4.1-mini').result).turnStatus).toBe('completed');
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.body.model).toBe('gpt-4.1-mini');
    expect(f.host.pid).toBe(pid);
  }, 30_000);

  it('runs startup inference and user tasks with the same OpenRouter key', async () => {
    const f = await fixture(res => complete(res, [message]));
    const fetcher = vi.spyOn(officialFetch, 'createOfficialFetch')
      .mockReturnValue((_target, options) => fetch(f.supplierUrl, options));
    cleanup.push(() => { fetcher.mockRestore(); });
    const release = vi.fn(async () => undefined);
    const account = {
      readState: async (): Promise<GatewayAccountState> => ({
        source: 'gateway', authState: 'signed_in', activationState: 'ready',
        account: { id: 'a', email: 'a@test', verified: true }, bindingVersion: '1',
        models: [{ id: 'gpt-5.2', modality: 'text', capabilities: ['responses'] }],
        selectedModels: { text: 'gpt-5.2' }, activationError: null
      }),
      beginModelUse: vi.fn(async () => ({ credentials: {
        accountId: 'a', modelKey: 'test-official-key-a', keyVersion: '1', bindingVersion: '1',
        baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct' as const,
        models: [{ id: 'gpt-5.2', modality: 'text' as const, capabilities: ['responses'] }], defaults: { text: 'gpt-5.2' }
      }, release }))
    };
    const prepared = await prepareOfficialRuntimeProbe({ account, readProxy: async () => '' });
    expect(prepared).toBeDefined();
    cleanup.push(() => prepared!.cleanup());
    const result = await probeCodex({
      codexBin, codexHome: prepared!.codexHome, cwd: join(f.root, 'probe'),
      baseEnvironment: prepared!.env, timeoutMs: 15_000
    });
    expect(result.ready).toBe(true);
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.headers.authorization).toBe('Bearer test-official-key-a');
    expect(JSON.stringify(f.requests[0]!.body.input)).toContain('startup availability probe');
    expect((await f.run().result).turnStatus).toBe('completed');
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1]!.headers.authorization).toBe('Bearer test-official-key-a');
    const home = prepared!.codexHome;
    await prepared!.cleanup();
    expect(existsSync(home)).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  }, 30_000);

  it('waits for sign-in and fails before inference when model credentials are unavailable', async () => {
    const beginModelUse = vi.fn(async () => { throw new Error('model credentials unavailable'); });
    const state: GatewayAccountState = {
      source: 'manual', authState: 'signed_out', activationState: 'inactive',
      account: null, bindingVersion: null, models: [], activationError: null
    };
    const account = { readState: async () => state, beginModelUse };
    expect(await prepareOfficialRuntimeProbe({ account, readProxy: async () => '' })).toBeUndefined();
    expect(beginModelUse).not.toHaveBeenCalled();
    Object.assign(state, {
      source: 'gateway', authState: 'signed_in', account: { id: 'a', email: 'a@test', verified: true },
      models: [{ id: 'gpt-5.2', modality: 'text', capabilities: ['responses'] }], selectedModels: { text: 'gpt-5.2' }
    });
    await expect(prepareOfficialRuntimeProbe({ account, readProxy: async () => '' })).rejects.toThrow('model credentials unavailable');
    expect(beginModelUse).toHaveBeenCalledOnce();
  });
  it.each(['https://openrouter.ai/api/v1', 'https://api.88api.ai/v1'])('preserves complete tool history through the direct stateless connection %s', async supplierBase => {
    const f = await fixture((res, requests) => {
      if (requests.length === 1) complete(res, [{ id: 'fc_direct', type: 'function_call', call_id: 'call_direct', name: 'exec_command', arguments: JSON.stringify({ cmd: 'pwd', max_output_tokens: 100 }), status: 'completed' }]);
      else complete(res, [message]);
    }, true, supplierBase);
    expect((await f.run().result).turnStatus).toBe('completed');
    expect(f.requests).toHaveLength(2);
    expect(f.requests.every(request => request.body.store === false && !request.body.previous_response_id && request.headers.authorization === 'Bearer test-official-key-a')).toBe(true);
    expect(JSON.stringify(f.requests[1]!.body.input)).toContain('function_call_output');
    expect(JSON.stringify(f.requests[1]!.body.input)).toContain('call_direct');
  }, 30_000);
  it.each(['function', 'custom'])('executes a real Runtime %s tool round trip through the 88API Chat-to-Responses bridge', async toolType => {
    const f = await fixture((res, requests) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const choice = requests.length === 1
        ? { delta: { tool_calls: [{ index: 0, id: 'call_chat', type: 'function', function: toolType === 'custom'
          ? { name: 'apply_patch', arguments: JSON.stringify({ input: `*** Begin Patch\n*** Add File: ${join(f.root, 'chat-bridge.txt')}\n+bridge ready\n*** End Patch` }) }
          : { name: 'exec_command', arguments: JSON.stringify({ cmd: 'pwd', max_output_tokens: 100 }) } }] }, finish_reason: 'tool_calls' }
        : { delta: { content: 'gateway ready' }, finish_reason: 'stop' };
      res.end(`data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n\n`);
    }, true, 'https://api.88api.ai/v1', true);
    const result = await f.run().result;
    expect(result.turnStatus, JSON.stringify({ result, requests: f.requests.length })).toBe('completed');
    expect(f.requests).toHaveLength(2);
    expect(f.requests[0]!.body).not.toHaveProperty('input');
    expect(JSON.stringify(f.requests[1]!.body.messages)).toContain('call_chat');
    expect(JSON.stringify(f.requests[1]!.body.messages)).toContain('"role":"tool"');
    expect(f.requests.every(request => request.headers.authorization === 'Bearer test-official-key-a')).toBe(true);
    if (toolType === 'custom') expect(readFileSync(join(f.root, 'chat-bridge.txt'), 'utf8')).toBe('bridge ready\n');
  }, 30_000);
  it('uses only the official key for Responses streaming and leaves no auth.json', async () => {
    const f = await fixture(res => complete(res, [message]));
    const result = await f.run().result;
    expect(result.turnStatus).toBe('completed');
    expect(f.requests).toHaveLength(1);
    expect(f.requests[0]!.headers.authorization).toBe('Bearer test-official-key-a');
    expect(f.requests[0]!.body.stream).toBe(true);
    expect(existsSync(join(f.prepared.codexHome, 'auth.json'))).toBe(false);
    await f.binding.close();
    expect(() => process.kill(f.host.pid!, 0)).toThrow();
    await expect(f.binding.prepare()).rejects.toThrow('signed out');
    expect(() => f.run()).toThrow();
    expect(f.requests).toHaveLength(1);
  }, 30_000);

  it('keeps the native tool call and submits its result as a second model operation', async () => {
    const f = await fixture((res, requests) => {
      if (requests.length === 1) {
        const tools = requests[0]!.body.tools as Array<{ name?: string }>;
        expect(tools.some(tool => tool.name === 'exec_command')).toBe(true);
        complete(res, [{
          id: 'fc_test', type: 'function_call', call_id: 'call_test', name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'if test -n "$OC_GATEWAY_MODEL_KEY"; then echo CLOUD_KEY_PRESENT; else echo CLOUD_KEY_ABSENT; fi', max_output_tokens: 100 }), status: 'completed'
        }]);
      } else complete(res, [message]);
    });
    expect((await f.run().result).turnStatus).toBe('completed');
    expect(f.requests).toHaveLength(2);
    expect(JSON.stringify(f.requests[1]!.body.input)).toContain('function_call_output');
    const output = (f.requests[1]!.body.input as Array<{ type: string; output?: string }>).find(item => item.type === 'function_call_output')?.output;
    expect(output).toContain('CLOUD_KEY_ABSENT');
    expect(output).not.toContain('CLOUD_KEY_PRESENT');
    expect(f.requests.every(request => request.headers.authorization === 'Bearer test-official-key-a')).toBe(true);
  }, 30_000);

  it.each([400, 429])('does not resubmit when the local relay preserves HTTP %s', async status => {
    const f = await fixture(res => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: {
        code: 'upstream_rejected', message: 'The selected parameter was rejected', requestId: 'ocreq_rejected'
      } }));
    }, true);
    expect((await f.run().result).turnStatus).toBe('failed');
    expect(f.requests).toHaveLength(1);
  }, 30_000);

  it.each(['rejected', 'stream_lost'] as const)('does not blindly resubmit after %s', async mode => {
    const f = await fixture(res => {
      if (mode === 'rejected') {
        res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'test unavailable' } }));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        event(res, 'response.created', { response: { id: 'resp_accepted', status: 'in_progress', output: [] } });
        res.end();
      }
    });
    expect((await f.run().result).turnStatus).toBe('failed');
    expect(f.requests).toHaveLength(1);
  }, 30_000);

  it('kills a live credential-holding process before logout succeeds', async () => {
    const f = await fixture(res => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      event(res, 'response.created', { response: { id: 'resp_still_running', status: 'in_progress', output: [] } });
    });
    const running = f.run();
    const result = running.result.catch(error => error);
    await expect.poll(() => f.requests.length, { timeout: 10_000 }).toBe(1);
    await f.binding.close();
    await result;
    expect(() => process.kill(f.host.pid!, 0)).toThrow();
    await expect(f.binding.prepare()).rejects.toThrow('signed out');
    expect(f.requests).toHaveLength(1);
  }, 30_000);
});
