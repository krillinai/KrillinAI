import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createKrillinCodexLlmGateway } from '../../src/creator/krillin/codex-llm-gateway.js';

describe('Krillin Codex LLM gateway', () => {
  it('cancels in-flight HTTP requests on close and preserves upstream HTTP failures', async () => {
    const createHost = vi.fn();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { code: 'unsupported_value', message: 'none is unsupported' } }, { status: 400 }))
      .mockImplementationOnce(async (_url, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('Request cancelled')), { once: true });
      }));
    const gateway = createKrillinCodexLlmGateway({ codexBin: '/fake/codex', codexHome: '/unused', cwd: '/unused', createHost, fetcher,
      readLocalConfiguration: async () => ({ authentication: 'api_key', wireApi: 'responses', provider: {
        baseUrl: 'https://local.example/v1', apiKey: 'provider-key', model: 'local-model' } }) });
    const server = Fastify();
    await gateway.register(server);
    const headers = { authorization: `Bearer ${gateway.config('http://localhost').apiKey}` };
    const request = { method: 'POST' as const, url: '/internal/krillin-llm/v1/chat/completions', headers,
      payload: { messages: [{ role: 'user', content: 'Hello' }], reasoning_effort: 'none' } };
    try {
      const rejected = await server.inject(request);
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ error: { code: 'unsupported_value', message: 'none is unsupported' } });
      const pending = server.inject(request).then(response => response);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      await gateway.close();
      expect(fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(true);
      expect((await pending).statusCode).toBe(502);
      expect((await server.inject(request)).statusCode).toBe(503);
      expect(createHost).not.toHaveBeenCalled();
    } finally { await gateway.close(); await server.close(); }
  });

  it('runs API-key requests concurrently over HTTP without acquiring Codex process slots', async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const fetcher = vi.fn<typeof fetch>(async () => {
      await barrier;
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '你好' }] }] });
    });
    const createHost = vi.fn();
    const gateway = createKrillinCodexLlmGateway({ codexBin: '/fake/codex', codexHome: '/unused', cwd: '/unused', createHost, fetcher,
      readLocalConfiguration: async () => ({ authentication: 'api_key', wireApi: 'responses', provider: {
        baseUrl: 'https://local.example/v1', apiKey: 'provider-key', model: 'local-model' } }) });
    const server = Fastify();
    await gateway.register(server);
    const config = gateway.config('http://localhost');
    const requests = Array.from({ length: 3 }, () => server.inject({ method: 'POST', url: '/internal/krillin-llm/v1/chat/completions',
      headers: { authorization: `Bearer ${config.apiKey}` }, payload: { messages: [{ role: 'user', content: 'Hello' }], reasoning_effort: 'none' } }).then(response => response));
    try {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
      release();
      expect((await Promise.all(requests)).map(response => response.statusCode)).toEqual([200, 200, 200]);
      expect(createHost).not.toHaveBeenCalled();
    } finally { release(); await gateway.close(); await server.close(); }
  });

  it('authenticates and converts a Codex final message to chat completions', async () => {
    const run = vi.fn((input: { onNotification?(value: Record<string, unknown>): void }) => {
      input.onNotification?.({
        method: 'item/completed',
        params: { item: { id: 'answer', type: 'agentMessage', text: '{"translation":"你好"}' } }
      });
      return {
        cancel() {},
        result: Promise.resolve({
          threadId: 'thread-1',
          turnId: 'turn-1',
          turnStatus: 'completed' as const,
          stderr: '',
          terminationReason: 'completed' as const,
          outputTruncation: {
            stderr: { truncated: false, droppedBytes: 0, droppedItems: 0 },
            frames: { truncated: false, droppedBytes: 0, droppedItems: 0 }
          }
        })
      };
    });
    const createHost = vi.fn(() => ({
      pid: 1,
      started: Promise.resolve(1),
      run,
      isReusable: () => true,
      close: vi.fn(async () => undefined)
    }));
    let configurationVersion = 'first';
    const gateway = createKrillinCodexLlmGateway({
      codexBin: '/bundled/codex',
      codexHome: '/isolated/codex-home',
      cwd: '/workspace',
      createHost,
      readConfiguration: () => ({ codexHome: '/following/local-home', version: configurationVersion })
    });
    const server = Fastify();
    await gateway.register(server);
    const config = gateway.config('http://127.0.0.1:1234');

    const unauthorized = await server.inject({
      method: 'POST',
      url: '/internal/krillin-llm/v1/chat/completions',
      payload: { messages: [{ role: 'user', content: 'translate' }] }
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await server.inject({
      method: 'POST',
      url: '/internal/krillin-llm/v1/chat/completions',
      headers: { authorization: `Bearer ${config.apiKey}` },
      payload: {
        model: 'codex',
        messages: [
          { role: 'system', content: 'Translate subtitles.' },
          { role: 'user', content: 'Hello' }
        ],
        response_format: { type: 'json_object' }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      model: 'codex',
      choices: [{ message: { role: 'assistant', content: '{"translation":"你好"}' } }]
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('SYSTEM:\nTranslate subtitles.'),
      developerInstructions: expect.stringContaining('valid JSON')
    }));
    const origin = await server.listen({ port: 0, host: '127.0.0.1' });
    const streamed = await fetch(`${origin}/internal/krillin-llm/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'codex',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });
    const streamBody = await streamed.text();
    expect(streamed.status).toBe(200);
    expect(streamed.headers.get('content-type')).toContain('text/event-stream');
    expect(streamBody).toContain('"object":"chat.completion.chunk"');
    expect(streamBody).toContain('"content":"{\\"translation\\":\\"你好\\"}"');
    expect(streamBody).toContain('data: [DONE]');
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(createHost).toHaveBeenCalledWith(expect.objectContaining({ codexHome: '/following/local-home' }));
    configurationVersion = 'changed';
    expect((await server.inject({ method: 'POST', url: '/internal/krillin-llm/v1/chat/completions',
      headers: { authorization: `Bearer ${config.apiKey}` },
      payload: { messages: [{ role: 'user', content: 'New configuration' }] }
    })).statusCode).toBe(200);
    expect(createHost).toHaveBeenCalledTimes(2);
    expect(createHost.mock.results[0]!.value.close).toHaveBeenCalledOnce();
    await gateway.close();
    await server.close();
  });
});
