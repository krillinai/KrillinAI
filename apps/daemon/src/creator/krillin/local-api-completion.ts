import { randomUUID } from 'node:crypto';
import type { LocalCodexModelConfiguration } from '../../codex/local-provider.js';
import { openAiCompatibleEndpoint } from '../../creator-services/upstream-fetch.js';

type Item = Record<string, unknown>;
export type TextChatCompletion = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{ index: number; message: { role: 'assistant'; content: string }; finish_reason: 'stop' | 'length' }>;
  usage: Item;
};

export class LocalApiCompletionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Adapt text requests over HTTP without an Agent, tools, threads or a process pool. */
export async function completeLocalApiRequest(input: {
  local: Extract<LocalCodexModelConfiguration, { authentication: 'api_key' }>;
  body: Item;
  fetcher: typeof fetch;
  signal: AbortSignal;
}): Promise<TextChatCompletion> {
  const { provider } = input.local;
  const responses = input.local.wireApi === 'responses';
  const body: Item = responses
    ? { model: input.body.model ?? provider.model, input: input.body.messages, store: false,
        // Codex-compatible providers may require streaming. Buffer only the HTTP
        // response, preserving its completion status and real usage for Krillin.
        stream: true }
    : { ...input.body, model: input.body.model ?? provider.model, stream: false };
  if (responses) {
    const budget = input.body.max_completion_tokens ?? input.body.max_tokens;
    if (budget !== undefined) body.max_output_tokens = budget;
    if (input.body.reasoning_effort !== undefined) body.reasoning = { effort: input.body.reasoning_effort };
    for (const key of ['temperature', 'top_p']) if (input.body[key] !== undefined) body[key] = input.body[key];
    const format = item(input.body.response_format);
    if (format?.type === 'json_object') body.text = { format };
    else if (format?.type === 'json_schema') body.text = { format: { type: 'json_schema', ...item(format.json_schema) } };
  }
  const response = await input.fetcher(openAiCompatibleEndpoint(provider.baseUrl, responses ? 'responses' : 'chat/completions'), {
    method: 'POST', signal: input.signal,
    headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const fail = (value: unknown, status = 502): never => {
    const error = item(value);
    const message = typeof error?.message === 'string'
      ? error.message.replaceAll(provider.apiKey, '[redacted]').slice(0, 1_000)
      : 'Local model API request failed';
    throw new LocalApiCompletionError(status, typeof error?.code === 'string' ? error.code : 'local_model_api_failed', message);
  };
  if (!response.ok) {
    let value: Item | undefined;
    try { value = item(JSON.parse(await readText(response))); } catch { /* Preserve the HTTP status for non-JSON errors. */ }
    fail(value?.error, response.status);
  }
  if (!responses) {
    const payload = item(JSON.parse(await readText(response)));
    if (payload?.error) fail(payload.error);
    if (!Array.isArray(payload?.choices) || !payload.choices.length) fail(undefined);
    return payload as unknown as TextChatCompletion;
  }

  let payload: Item | undefined;
  let deltas = '';
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    if (!response.body) fail(undefined);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        bytes += next.value?.byteLength ?? 0;
        if (bytes > MAX_RESPONSE_BYTES) fail({ message: 'Local model API response is too large' });
        buffer += decoder.decode(next.value, { stream: !next.done });
        buffer = buffer.replace(/\r\n/g, '\n');
        if (next.done && buffer.trim()) buffer += '\n\n';
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const event = item(JSON.parse(data));
          if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') deltas += event.delta;
          if (event?.type === 'error' || event?.type === 'response.failed') fail(event.error ?? item(event.response)?.error ?? event);
          if (event?.type === 'response.completed' || event?.type === 'response.incomplete') payload = item(event.response);
        }
        if (payload || next.done) break;
      }
    } finally { await reader.cancel().catch(() => undefined); }
  } else {
    payload = item(JSON.parse(await readText(response)));
  }
  if (payload?.error) fail(payload.error);
  if (!payload || !['completed', 'incomplete'].includes(String(payload.status))) {
    fail({ code: 'local_model_incomplete_response', message: 'Local model API ended without a completed response' });
  }
  const result = payload!;
  const incomplete = result.status === 'incomplete';
  if (incomplete && item(result.incomplete_details)?.reason !== 'max_output_tokens') fail(result.incomplete_details);
  const content = Array.isArray(result.output) ? result.output.flatMap(value => {
    const output = item(value);
    return output?.type === 'message' && Array.isArray(output.content)
      ? output.content.flatMap(value => {
          const part = item(value);
          return part?.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [];
        }) : [];
  }).join('') : '';
  const usage = item(result.usage);
  return {
    id: typeof result.id === 'string' ? result.id : `chatcmpl-${randomUUID()}`,
    object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: typeof result.model === 'string' ? result.model : String(body.model),
    choices: [{ index: 0, message: { role: 'assistant', content: content || deltas }, finish_reason: incomplete ? 'length' : 'stop' }],
    usage: { prompt_tokens: usage?.input_tokens ?? 0, completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0, prompt_tokens_details: usage?.input_tokens_details,
      completion_tokens_details: usage?.output_tokens_details }
  };
}

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
async function readText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      bytes += next.value?.byteLength ?? 0;
      if (bytes > MAX_RESPONSE_BYTES) throw new LocalApiCompletionError(502, 'local_model_response_too_large', 'Local model API response is too large');
      text += decoder.decode(next.value, { stream: !next.done });
      if (next.done) return text;
    }
  } finally { await reader.cancel().catch(() => undefined); }
}

function item(value: unknown): Item | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Item : undefined;
}
