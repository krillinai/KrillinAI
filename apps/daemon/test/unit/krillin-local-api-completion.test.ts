import { describe, expect, it, vi } from 'vitest';
import { completeLocalApiRequest, LocalApiCompletionError } from '../../src/creator/krillin/local-api-completion.js';

const local = { authentication: 'api_key' as const, wireApi: 'responses' as const,
  provider: { baseUrl: 'https://local.example/v1', apiKey: 'provider-secret', model: 'local-model' } };
const body = { model: 'local-model', messages: [{ role: 'user', content: 'Translate Hello into Chinese.' }],
  reasoning_effort: 'none', max_completion_tokens: 512 };
const result = { id: 'response-1', model: 'local-model', status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: '你好' }] }],
  usage: { input_tokens: 20, output_tokens: 2, total_tokens: 22,
    input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 0 } } };

function stream(events: unknown[]) {
  const encoded = new TextEncoder().encode(events.map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join(''));
  let cursor = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (cursor === encoded.length) { controller.close(); return; }
    // Split UTF-8 characters and CRLF frame boundaries deliberately.
    controller.enqueue(encoded.slice(cursor, cursor + 3)); cursor = Math.min(cursor + 3, encoded.length);
  } }), { headers: { 'content-type': 'text/event-stream' } });
}

describe('Krillin local HTTP model transport', () => {
  it('preserves JSON format, budget and none reasoning without adding Agent instructions', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result));
    const completion = await completeLocalApiRequest({ local, body: { ...body, response_format: { type: 'json_schema',
      json_schema: { name: 'translation', strict: true, schema: { type: 'object' } } } }, fetcher, signal: new AbortController().signal });
    expect(completion).toMatchObject({ choices: [{ message: { content: '你好' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 2, total_tokens: 22,
        prompt_tokens_details: { cached_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 0 } } });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ model: 'local-model', input: body.messages,
      store: false, stream: true, max_output_tokens: 512, reasoning: { effort: 'none' },
      text: { format: { type: 'json_schema', name: 'translation', strict: true, schema: { type: 'object' } } } });
  });

  it('accepts completed SSE responses across byte and frame boundaries and retains real usage', async () => {
    const completion = await completeLocalApiRequest({ local, body, signal: new AbortController().signal,
      fetcher: async () => stream([{ type: 'response.created' }, { type: 'response.output_text.delta', delta: '你' },
        { type: 'response.output_text.delta', delta: '好' }, { type: 'response.completed', response: { ...result, output: [] } }]) });
    expect(completion.choices[0]!.message.content).toBe('你好');
    expect(completion.usage.total_tokens).toBe(22);
  });

  it('marks output-budget exhaustion as length so Krillin does not accept a truncated translation', async () => {
    const completion = await completeLocalApiRequest({ local, body, signal: new AbortController().signal,
      fetcher: async () => stream([{ type: 'response.incomplete', response: { ...result, status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' } } }]) });
    expect(completion.choices[0]!.finish_reason).toBe('length');
  });

  it.each([
    [{ type: 'response.output_text.delta', delta: 'unfinished' }],
    [{ type: 'response.failed', response: { error: { code: 'upstream_failed', message: 'Failed' } } }],
    [{ type: 'error', code: 'upstream_failed', message: 'Failed' }],
    [{ type: 'response.incomplete', response: { ...result, status: 'incomplete', incomplete_details: { reason: 'content_filter' } } }]
  ])('rejects interrupted or failed responses instead of reporting success (%j)', async (...events) => {
    await expect(completeLocalApiRequest({ local, body, signal: new AbortController().signal,
      fetcher: async () => stream(events) })).rejects.toBeInstanceOf(LocalApiCompletionError);
  });

  it.each([400, 401, 429])('preserves HTTP %i without retrying with reasoning enabled or exposing the API key', async status => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: { code: 'upstream_rejected', message: 'Rejected provider-secret' } }, { status }));
    await expect(completeLocalApiRequest({ local, body, fetcher, signal: new AbortController().signal }))
      .rejects.toMatchObject({ status, code: 'upstream_rejected', message: 'Rejected [redacted]' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
