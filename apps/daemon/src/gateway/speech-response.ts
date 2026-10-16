import { setTimeout as delay } from 'node:timers/promises';
import { GatewayError } from './client.js';

type SpeechReceipt = { requestId: string; state: string };

export async function resolveGatewaySpeech(input: {
  response?: Response;
  requestId?: string;
  signal: AbortSignal;
  request(resource: string): Promise<Response>;
  onReceipt(receipt: SpeechReceipt): Promise<void>;
}): Promise<Response> {
  let requestId = input.requestId;
  const readReceipt = async (response: Response): Promise<SpeechReceipt> => {
    if (!response.ok) {
      await response.body?.cancel();
      throw new GatewayError(response.status === 401 ? 'auth_required' : 'request_outcome_unknown', response.status === 401 ? 401 : 409);
    }
    const value = await response.json() as Partial<SpeechReceipt>;
    const header = response.headers.get('x-request-id');
    if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,128}$/.test(value.requestId)
      || (requestId && value.requestId !== requestId) || (header && value.requestId !== header)
      || !['submitting', 'waiting_upstream', 'succeeded', 'failed', 'canceled', 'outcome_unknown'].includes(value.state ?? '')) {
      throw new GatewayError('invalid_gateway_response');
    }
    requestId = value.requestId;
    const receipt = value as SpeechReceipt;
    await input.onReceipt(receipt);
    return receipt;
  };
  let receipt = input.response ? await readReceipt(input.response) : undefined;
  for (;;) {
    input.signal.throwIfAborted();
    if (!requestId) throw new GatewayError('invalid_gateway_response');
    if (!receipt) receipt = await readReceipt(await input.request(`requests/${requestId}`));
    if (receipt.state === 'succeeded') {
      const response = await input.request(`requests/${requestId}/result`);
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (response.status !== 200 || !(contentType?.startsWith('audio/') || contentType === 'application/octet-stream')) {
        await response.body?.cancel();
        throw new GatewayError('request_outcome_unknown', 409);
      }
      const headers = new Headers(response.headers);
      headers.set('X-Request-ID', requestId);
      return new Response(response.body, { status: 200, headers });
    }
    if (receipt.state === 'failed' || receipt.state === 'canceled') throw new GatewayError('official_service_unavailable', 502);
    if (receipt.state === 'outcome_unknown') throw new GatewayError('request_outcome_unknown', 409);
    await delay(1_000, undefined, { signal: input.signal });
    receipt = undefined;
  }
}
