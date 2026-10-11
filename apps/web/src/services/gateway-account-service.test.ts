import { expect, it, vi } from 'vitest';
import { RuntimeClient } from '../runtime/client.js';
import { createGatewayAccountService } from './gateway-account-service.js';

it('checks browser authorization through the shared Daemon and adds the host return destination', async () => {
  const grant = { attemptId: 'attempt-1', authorizationUrl: 'https://gateway.example/device?grant=attempt-1', expiresAt: '2026-10-10T12:00:00Z' };
  const client = new RuntimeClient({ baseUrl: 'http://localhost', fetchImpl: vi.fn(async () => Response.json(grant)) });
  const post = vi.spyOn(client, 'post');
  const service = createGatewayAccountService(client, { authorizationReturnUrl: 'opencreator://auth/complete' });
  const result = await service.start();
  expect(new URL(result.authorizationUrl).searchParams.get('returnTo')).toBe('opencreator://auth/complete');
  expect(new URL(result.authorizationUrl).searchParams.get('grant')).toBe('attempt-1');
  expect(result.attemptId).toBe(grant.attemptId);
  await service.getState({ checkAuthorization: true });
  expect(post).toHaveBeenLastCalledWith('/gateway/auth/check', {});
});
it('displays a signed-in account when official activation is blocked', async () => {
  const snapshot = { source: 'manual', authState: 'signed_in', activationState: 'blocked', account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: null, models: [], activationError: { code: 'services_not_ready', message: 'Official service is not ready' } };
  const client = new RuntimeClient({ baseUrl: 'http://localhost', fetchImpl: vi.fn(async () => Response.json(snapshot)) });
  await expect(createGatewayAccountService(client).getState()).resolves.toEqual(snapshot);
});

it('reads the subscription summary through the shared Daemon', async () => {
  const client = new RuntimeClient({ baseUrl: 'http://localhost', fetchImpl: vi.fn(async () => Response.json({})) });
  const read = vi.spyOn(client, 'get');
  await createGatewayAccountService(client).getSummary();
  expect(read).toHaveBeenCalledWith('/gateway/billing/summary');
});
it('requests a website session with the host billing return address', async () => {
  const client = new RuntimeClient({ baseUrl: 'http://localhost', fetchImpl: vi.fn(async () => Response.json({ url: 'https://gateway.example/auth#handoff=code' })) });
  const post = vi.spyOn(client, 'post');
  await createGatewayAccountService(client, { billingReturnUrl: 'opencreator://billing/return' }).openWebAccount('recharge', 'zh');
  expect(post).toHaveBeenLastCalledWith('/gateway/account/web', { destination: 'recharge', locale: 'zh', returnUrl: 'opencreator://billing/return' });
});
it('loads private order details and pages credit grants through the shared Daemon', async () => {
  const client = new RuntimeClient({ baseUrl: 'http://localhost', fetchImpl: vi.fn(async () => Response.json({})) });
  const read = vi.spyOn(client, 'get'); const post = vi.spyOn(client, 'post');
  const service = createGatewayAccountService(client);
  await service.getOrder('order/a');
  expect(read).toHaveBeenLastCalledWith('/gateway/billing/orders/order%2Fa');
  await service.getCreditGrants('trial:a+b');
  expect(read).toHaveBeenLastCalledWith('/gateway/billing/ledger?cursor=trial%3Aa%2Bb');
  await service.checkout('starter', 'operation-id', { locale: 'zh', currency: 'hkd' });
  expect(post).toHaveBeenLastCalledWith('/gateway/billing/checkout', { planId: 'starter', operationId: 'operation-id', locale: 'zh', currency: 'hkd' });
});

it('loads and shares photo bytes through the authenticated Runtime client', async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }));
  const client = new RuntimeClient({ baseUrl: 'http://localhost', token: 'runtime-token', fetchImpl: fetcher });
  const service = createGatewayAccountService(client);
  const [first, second] = await Promise.all([service.getAvatar!('a', 'picture-1'), service.getAvatar!('a', 'picture-1')]);
  expect(first).toBe(second);
  expect(first.type).toBe('image/png');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('http://localhost/gateway/avatar?accountId=a', expect.objectContaining({ headers: { Authorization: 'Bearer runtime-token' } }));
  await service.getAvatar!('b', 'picture-2');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
