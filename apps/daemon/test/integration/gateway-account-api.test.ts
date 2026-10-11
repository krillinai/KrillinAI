import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerGatewayAccountRoutes } from '../../src/api/routes.gateway-account.js';
import { createGatewayClient } from '../../src/gateway/client.js';
import { GatewayError } from '../../src/gateway/client.js';
import { createGatewayAccountService, type GatewayAccountService } from '../../src/gateway/account-service.js';

it('proxies account-owned orders and encoded grant cursors without caching', async () => {
  const billing = vi.fn(async () => ({ items: [] }));
  const server = Fastify();
  try {
    await registerGatewayAccountRoutes(server, { billing } as unknown as GatewayAccountService);
    const order = await server.inject({ method: 'GET', url: '/gateway/billing/orders/order-a' });
    expect(order.statusCode).toBe(200);
    expect(order.headers['cache-control']).toBe('no-store');
    expect(billing).toHaveBeenLastCalledWith('/api/v1/billing/orders/order-a');
    const ledger = await server.inject({ method: 'GET', url: '/gateway/billing/ledger?cursor=trial%3Aa%2Bb' });
    expect(ledger.statusCode).toBe(200);
    expect(billing).toHaveBeenLastCalledWith('/api/v1/billing/ledger?cursor=trial%3Aa%2Bb');
    billing.mockClear();
    const invalid = await server.inject({ method: 'GET', url: '/gateway/billing/ledger?cursor=' + 'a'.repeat(257) });
    expect(invalid.statusCode).toBe(400);
    expect(billing).not.toHaveBeenCalled();
  } finally { await server.close(); }
});

it('proxies validated website handoffs through the authenticated account service', async () => {
  const billing = vi.fn(async () => ({ url: 'https://gateway.example/auth#handoff=example' }));
  const server = Fastify();
  try {
    await registerGatewayAccountRoutes(server, { billing } as unknown as GatewayAccountService);
    const body = { destination: 'recharge', locale: 'zh', returnUrl: 'opencreator://billing/return' };
    const result = await server.inject({ method: 'POST', url: '/gateway/account/web', payload: body });
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(billing).toHaveBeenCalledWith('/api/v1/auth/browser/start', body);
    billing.mockClear();
    const invalid = await server.inject({ method: 'POST', url: '/gateway/account/web', payload: { ...body, destination: 'https://evil.test' } });
    expect(invalid.statusCode).toBe(400);
    expect(billing).not.toHaveBeenCalled();
    billing.mockRejectedValueOnce(new GatewayError('invalid_origin', 403));
    const legacy = await server.inject({ method: 'POST', url: '/gateway/account/web', payload: body });
    expect(legacy.statusCode).toBe(404);
    expect(legacy.json().error.details.gatewayCode).toBe('browser_handoff_unavailable');
  } finally { await server.close(); }
});

it.skipIf(!process.env.GATEWAY_BROWSER_TEST_ORIGIN)('device service completes authorization against the local Go gateway', async () => {
  const origin = process.env.GATEWAY_BROWSER_TEST_ORIGIN!;
  const root = await mkdtemp(join(tmpdir(),'oc-gateway-api-'));
  const service = createGatewayAccountService({ dataDir:root, client:createGatewayClient(origin), activateRuntime:async()=>{ throw new Error('no test model'); }, closeRuntime:async()=>undefined, hasActiveTasks:()=>false, automaticPolling:false });
  try {
    const csrfResponse = await fetch(`${origin}/api/v1/auth/csrf`);
    const csrf = await csrfResponse.json() as {csrfToken:string};
    let cookies = csrfResponse.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const login = await fetch(`${origin}/api/v1/auth/login`,{method:'POST',headers:{Origin:origin,Cookie:cookies,'Content-Type':'application/json','X-CSRF-Token':csrf.csrfToken},body:JSON.stringify({email:'gateway-demo@example.test',password:process.env.GATEWAY_DEMO_PASSWORD})});
    expect(login.status).toBe(200);
    cookies += '; '+login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
    const grant=await service.startAuthorization();
    const approve=await fetch(`${origin}/api/v1/auth/device/approve`,{method:'POST',headers:{Origin:origin,Cookie:cookies,'Content-Type':'application/json','X-CSRF-Token':csrf.csrfToken},body:JSON.stringify({attemptId:grant.attemptId,decision:'approve'})});
    expect(approve.status).toBe(200);
    await service.pollAuthorization(grant.attemptId);
    expect(await service.readState()).toMatchObject({authState:'signed_in',activationState:'blocked',account:{email:'gateway-demo@example.test'}});
    const server = Fastify();
    try {
      await registerGatewayAccountRoutes(server, service);
      const response = await server.inject({ method: 'GET', url: '/gateway/billing/summary' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toMatchObject({ balance: { availableUnits: '0', reservedUnits: '0' }, subscription: null, billingAvailable: false });
    } finally { await server.close(); }
    await service.logout();
    const guestServer = Fastify();
    try {
      await registerGatewayAccountRoutes(guestServer, service);
      const plans = await guestServer.inject({ method: 'GET', url: '/gateway/plans' });
      expect(plans.statusCode).toBe(200);
      expect(plans.json()).toMatchObject({ plans: [], billingAvailable: false });
      const privateSummary = await guestServer.inject({ method: 'GET', url: '/gateway/billing/summary' });
      expect(privateSummary.statusCode).toBe(401);
    } finally { await guestServer.close(); }
  } finally { await service.close();await rm(root,{recursive:true,force:true}); }
});
