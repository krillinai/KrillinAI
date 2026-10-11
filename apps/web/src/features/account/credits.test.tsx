import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayAccountState } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { ApiClientError } from '../../runtime/errors.js';
import type { GatewayAccountSettingsService, GatewayBillingSummary, GatewayRechargeOrder } from '../../services/gateway-account-service.js';
import { GatewaySubscriptionSettingsView } from '../settings/GatewaySubscriptionSettingsView.js';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const account: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'account-a', email: 'creator@example.test', verified: true }, bindingVersion: null, models: [], activationError: null };
const summary: GatewayBillingSummary = { balance: { availableUnits: '413937000', reservedUnits: '0', periodEnd: null, asOf: '2026-10-10T01:00:00Z' }, subscription: null, billingAvailable: true, plansUrl: 'https://www.open-creator.ai/pricing' };
const order: GatewayRechargeOrder = { id: 'order-a', planId: 'starter', currency: 'usd', amountUnits: '500', creditUnits: '2500000000', status: 'pending', paymentStatus: 'pending', creditStatus: 'pending', reviewRequired: false, paymentMode: 'test', createdAt: new Date().toISOString(), paidAt: null, completedAt: null, expiresAt: '2099-01-01T00:00:00Z' };
const handoff = 'https://www.open-creator.ai/auth?lang=zh#handoff=' + 'a'.repeat(43);
function service(): GatewayAccountSettingsService {
  return { getState: vi.fn(async () => account), start: vi.fn(), cancel: vi.fn(), logout: vi.fn(), activate: vi.fn(), setSource: vi.fn(), selectModel: vi.fn(), getBalance: vi.fn(), getSummary: vi.fn(async () => summary),
    openWebAccount: vi.fn(async () => ({ url: handoff })), getPlans: vi.fn(), getOrders: vi.fn(async () => ({ items: [] })), getOrder: vi.fn(async () => ({ order })), getCreditGrants: vi.fn(), checkout: vi.fn(), portal: vi.fn() };
}
function page(value: GatewayAccountSettingsService, openExternal = vi.fn(), state = account, billingOrderId?: string) {
  return <LanguageProvider initialPreference="zh-CN"><GatewaySubscriptionSettingsView service={value} embedded accountState={state} openExternal={openExternal} billingOrderId={billingOrderId} billingReturnUrl="opencreator://billing/return"/></LanguageProvider>;
}

it('opens the website through a one-time account handoff without an app checkout', async () => {
  const value = service(); const open = vi.fn(); render(page(value, open));
  expect(await screen.findByText('413.937')).toBeInTheDocument();
  expect(value.getOrders).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(value.openWebAccount).toHaveBeenCalledWith('recharge', 'zh');
  expect(open).toHaveBeenCalledWith(handoff);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(value.checkout).not.toHaveBeenCalled();
  expect(value.getPlans).not.toHaveBeenCalled();
  expect(value.getCreditGrants).not.toHaveBeenCalled();
});

it.each([['账单与充值记录', 'account'], ['积分用量估算', 'usage'], ['FAQ', 'faq']])('opens %s at its website destination', async (label, destination) => {
  const value = service(); const open = vi.fn(); render(page(value, open));
  expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: label }));
  expect(value.openWebAccount).toHaveBeenCalledWith(destination, 'zh');
  expect(open).toHaveBeenCalledWith(handoff);
});

it('keeps website recharge available when purchases are disabled globally', async () => {
  const value = service(); vi.mocked(value.getSummary).mockResolvedValue({ ...summary, billingAvailable: false });
  render(page(value)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '充值积分' })).toBeEnabled();
  expect(screen.queryByText(/充值暂不可用/)).not.toBeInTheDocument();
});

it('falls back to the existing website when an older gateway lacks handoffs', async () => {
  const value = service(); const open = vi.fn();
  vi.mocked(value.openWebAccount!).mockRejectedValue(new ApiClientError({ status: 404, code: 'GATEWAY_UNAVAILABLE', message: 'Not found' }));
  render(page(value, open)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  const url = new URL(open.mock.calls[0]![0]);
  expect(url.pathname).toBe('/pricing');
  expect(url.searchParams.get('account')).toBe('account-a');
  expect(url.searchParams.get('returnTo')).toBe('opencreator://billing/return');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('rejects a handoff to an unexpected origin and permits retry', async () => {
  const value = service(); const open = vi.fn();
  vi.mocked(value.openWebAccount!).mockResolvedValueOnce({ url: 'https://evil.test/auth#handoff=' + 'a'.repeat(43) });
  render(page(value, open)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('网页未打开');
  expect(open).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(open).toHaveBeenCalledWith(handoff);
});

it('does not claim success when returning without a confirmed order', async () => {
  const value = service(); render(page(value)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(screen.queryByText(/充值成功/)).not.toBeInTheDocument();
  expect(value.getOrder).not.toHaveBeenCalled();
});

it('finds a new website order on focus and distinguishes payment from credit completion', async () => {
  const value = service(); render(page(value)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  vi.mocked(value.getOrders).mockResolvedValue({ items: [order] });
  vi.mocked(value.getOrder).mockResolvedValue({ order: { ...order, status: 'processing', paymentStatus: 'paid' } });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(await screen.findByText('付款成功，积分到账中')).toBeInTheDocument();
  expect(screen.queryByText(/充值成功/)).not.toBeInTheDocument();
  vi.mocked(value.getOrder).mockResolvedValue({ order: { ...order, status: 'completed', paymentStatus: 'paid', creditStatus: 'ready' } });
  vi.mocked(value.getSummary).mockResolvedValue({ ...summary, balance: { ...summary.balance, availableUnits: '2913937000' } });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(await screen.findByText('充值成功，已到账 2500 积分')).toBeInTheDocument();
  expect(screen.getByText('2913.937')).toBeInTheDocument();
  expect(sessionStorage.getItem('opencreator:billing-visit:account-a')).toBeNull();
});

it('verifies the returned order under the signed-in account rather than trusting the URL', async () => {
  const value = service(); vi.mocked(value.getOrder).mockRejectedValue(new Error('order belongs to another account'));
  render(page(value, vi.fn(), account, 'other-order'));
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法确认订单');
  expect(screen.queryByText(/充值成功/)).not.toBeInTheDocument();
});

it('restores a website visit and ignores orders that already existed', async () => {
  sessionStorage.setItem('opencreator:billing-visit:account-a', JSON.stringify({ startedAt: Date.now(), knownOrders: ['old-order'] }));
  const value = service(); vi.mocked(value.getOrders).mockResolvedValue({ items: [{ ...order, id: 'old-order' }] });
  render(page(value)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await waitFor(() => expect(value.getOrders).toHaveBeenCalled());
  expect(value.getOrder).not.toHaveBeenCalled();
});

it('ignores a website response from the previous account', async () => {
  const value = service(); const open = vi.fn(); let finish!: (value: { url: string }) => void;
  vi.mocked(value.openWebAccount!).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(page(value, open)); expect(await screen.findByText('413.937')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  view.rerender(page(value, open, { ...account, account: { id: 'account-b', email: 'other@example.test', verified: true } }));
  await act(async () => finish({ url: handoff }));
  expect(open).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('opencreator:billing-visit:account-a')).toBeNull();
});
