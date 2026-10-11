import type { GatewayAccountState, GatewayAuthorization, GatewayBalanceSnapshot, GatewayBalanceState, ServiceSource } from '@opencreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';
export type GatewayPlan = { id: string; name: string; currency: string; amountUnits: string; creditUnits: string; wechatAmountUnits?: string };
export type GatewayBillingAvailability = {
  billingAvailable: boolean;
  billingUnavailableReason?: 'purchases_disabled' | 'payment_service_unavailable' | 'official_services_unavailable' | 'payment_review' | string;
};
export type GatewayPlans = GatewayBillingAvailability & { plans: GatewayPlan[]; plansUrl?: string; purchaseMode?: 'credits'; paymentMode?: 'test' | 'live' };
export type GatewayRechargeOrder = {
  id: string; planId: string; planName?: string; operationId?: string;
  amountUnits: string; currency: string; creditUnits: string;
  status: string; paymentStatus: string; creditStatus: string; reviewRequired: boolean;
  paymentMode: 'test' | 'live'; createdAt: string; expiresAt?: string; paidAt: string | null; completedAt: string | null;
};
export type GatewayCreditGrant = { id: string; kind: 'grant'; units: string; createdAt: string; businessKey: string; source: string };
export type GatewayBillingSummary = {
  balance: GatewayBalanceSnapshot;
  subscription: { id: string; status: string; periodStart: string; periodEnd: string; cancelAtPeriodEnd: boolean; nextPlanId: string | null; plan?: GatewayPlan } | null;
  billingAvailable: boolean;
  billingUnavailableReason?: GatewayBillingAvailability['billingUnavailableReason'];
  purchaseMode?: 'credits';
  plansUrl?: string;
  paymentReview?: boolean;
};
export type GatewayWebDestination = 'recharge' | 'account' | 'usage' | 'faq';
export function createGatewayAccountService(client: Pick<RuntimeClient, 'get' | 'post' | 'patch'> & Partial<Pick<RuntimeClient, 'rawGet'>>, options: { authorizationReturnUrl?: string; billingReturnUrl?: string } = {}) {
  const rawGet = client.rawGet?.bind(client);
  let avatarCache: { key: string; work: Promise<Blob> } | undefined;
  return {
    ...(rawGet ? { getAvatar(accountId: string, revision: string): Promise<Blob> {
      const key = `${accountId}:${revision}`;
      if (avatarCache?.key === key) return avatarCache.work;
      const work = rawGet('/gateway/avatar?accountId=' + encodeURIComponent(accountId)).then(response => {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(response.headers.get('content-type')?.split(';')[0] ?? '')) throw new Error('Account picture is unavailable');
        return response.blob();
      }).catch(error => { if (avatarCache?.key === key) avatarCache = undefined; throw error; });
      avatarCache = { key, work };
      return work;
    } } : {}),
    getState(options?: { checkAuthorization?: boolean }): Promise<GatewayAccountState> {
      return options?.checkAuthorization ? client.post('/gateway/auth/check', {}) : client.get('/gateway/account');
    },
    async start(): Promise<GatewayAuthorization> {
      const grant = await client.post<GatewayAuthorization>('/gateway/auth/start', {});
      if (!options.authorizationReturnUrl) return grant;
      const url = new URL(grant.authorizationUrl);
      url.searchParams.set('returnTo', options.authorizationReturnUrl);
      return { ...grant, authorizationUrl: url.href };
    },
    cancel(): Promise<GatewayAccountState> { return client.post('/gateway/auth/cancel', {}); },
    logout(): Promise<GatewayAccountState> { return client.post('/gateway/auth/logout', {}); },
    activate(): Promise<GatewayAccountState> { return client.post('/gateway/auth/activate', {}); },
    setSource(source: ServiceSource): Promise<GatewayAccountState> { return client.patch('/gateway/source', { source }); },
    selectModel(modality: import('@opencreator/protocol').GatewayModel['modality'], model: string): Promise<GatewayAccountState> { return client.patch('/gateway/model', { modality, model }); },
    getBalance(): Promise<GatewayBalanceState> { return client.get('/gateway/billing'); },
    getSummary(): Promise<GatewayBillingSummary> { return client.get('/gateway/billing/summary'); },
    openWebAccount(destination: GatewayWebDestination, locale: 'zh' | 'en'): Promise<{ url: string }> {
      return client.post('/gateway/account/web', { destination, locale, ...(options.billingReturnUrl ? { returnUrl: options.billingReturnUrl } : {}) });
    },
    getPlans(): Promise<GatewayPlans> { return client.get('/gateway/plans'); },
    getOrders(): Promise<{ items: GatewayRechargeOrder[] }> { return client.get('/gateway/billing/orders'); },
    getOrder(id: string): Promise<{ order: GatewayRechargeOrder }> { return client.get('/gateway/billing/orders/' + encodeURIComponent(id)); },
    getCreditGrants(cursor?: string): Promise<{ items: GatewayCreditGrant[] }> { return client.get('/gateway/billing/ledger' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')); },
    checkout(planId: string, operationId: string, options: { locale?: 'zh' | 'en'; currency?: string } = {}): Promise<{ url: string; orderId: string }> { return client.post('/gateway/billing/checkout', { planId, operationId, ...options }); },
    portal(): Promise<{ url: string }> { return client.post('/gateway/billing/portal', {}); }
  };
}
export type GatewayAccountSettingsService = Omit<ReturnType<typeof createGatewayAccountService>, 'openWebAccount'> & Partial<Pick<ReturnType<typeof createGatewayAccountService>, 'openWebAccount'>>;
