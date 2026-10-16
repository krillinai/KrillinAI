import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
function page(value: GatewayAccountSettingsService, openExternal = vi.fn(), state = account, billingOrderId?: string, hasActiveTasks = false) {
  return <LanguageProvider initialPreference="zh-CN"><GatewaySubscriptionSettingsView service={value} embedded accountState={state} hasActiveTasks={hasActiveTasks} openExternal={openExternal} billingOrderId={billingOrderId} billingReturnUrl="opencreator://billing/return"/></LanguageProvider>;
}

it('keeps reserved credits in the balance and changes it only when usage settles', async () => {
  const value = service();
  const snapshot = (availableUnits: string, reservedUnits: string) => ({ ...summary, balance: { ...summary.balance, availableUnits, reservedUnits } });
  vi.mocked(value.getSummary).mockResolvedValue(snapshot('2087231437', '0'));
  render(page(value, vi.fn(), account, undefined, true));
  expect(await screen.findByText('2087')).toBeInTheDocument();
  const available = () => screen.getByText('可用积分').closest('div')!;
  const reserved = () => screen.getByText('预估消耗', { exact: true }).closest('div')!;
  expect(screen.queryByText('预估消耗', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('可用积分')).not.toBeInTheDocument();
  expect(screen.queryByText(/多余部分自动解冻/)).not.toBeInTheDocument();
  vi.mocked(value.getSummary).mockResolvedValue(snapshot('1325135419', '762096018'));
  await userEvent.setup().click(screen.getByRole('button', { name: '刷新积分' }));
  expect(screen.getByText('2087')).toBeInTheDocument();
  expect(within(available()).getByText('1325 积分')).toBeInTheDocument();
  expect(within(reserved()).getByText('762 积分')).toBeInTheDocument();
  expect(screen.queryByText(/已冻结|账户积分包含冻结部分|多余部分自动解冻/)).not.toBeInTheDocument();
  vi.mocked(value.getSummary).mockResolvedValue(snapshot('1937558807', '0'));
  await userEvent.setup().click(screen.getByRole('button', { name: '刷新积分' }));
  expect(screen.getByText('1938')).toBeInTheDocument();
  expect(screen.queryByText('预估消耗', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('可用积分')).not.toBeInTheDocument();
  expect(screen.queryByText(/多余部分自动解冻/)).not.toBeInTheDocument();
});

it.each([
  [true, '0'], [true, '1'], [true, '500000'], [true, '999999'],
  [false, '1000000'], [false, '762096018']
] as const)('hides the estimate when tasks are inactive or the reservation is below one credit (%s, %s)', async (hasActiveTasks, reservedUnits) => {
  const value = service();
  vi.mocked(value.getSummary).mockResolvedValue({ ...summary, balance: { ...summary.balance, availableUnits: '1860000000', reservedUnits } });
  render(page(value, vi.fn(), account, undefined, hasActiveTasks));
  await waitFor(() => expect(screen.getByRole('button', { name: '刷新积分' })).toBeEnabled());
  expect(screen.queryByText('预估消耗', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('可用积分')).not.toBeInTheDocument();
});

it('shows an estimate from one credit only while a task is active', async () => {
  const value = service();
  vi.mocked(value.getSummary).mockResolvedValue({ ...summary, balance: { ...summary.balance, reservedUnits: '1000000' } });
  const view = render(page(value));
  expect(await screen.findByText('415')).toBeInTheDocument();
  expect(screen.queryByText('预估消耗', { exact: true })).not.toBeInTheDocument();
  view.rerender(page(value, vi.fn(), account, undefined, true));
  expect(within(screen.getByText('预估消耗', { exact: true }).closest('div')!).getByText('1 积分')).toBeInTheDocument();
  view.rerender(page(value));
  expect(screen.queryByText('预估消耗', { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText('415')).toBeInTheDocument();
});

it('opens the website through a one-time account handoff without an app checkout', async () => {
  const value = service(); const open = vi.fn(); render(page(value, open));
  expect(await screen.findByText('414')).toBeInTheDocument();
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
  expect(await screen.findByText('414')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: label }));
  expect(value.openWebAccount).toHaveBeenCalledWith(destination, 'zh');
  expect(open).toHaveBeenCalledWith(handoff);
});

it('keeps website recharge available when purchases are disabled globally', async () => {
  const value = service(); vi.mocked(value.getSummary).mockResolvedValue({ ...summary, billingAvailable: false });
  render(page(value)); expect(await screen.findByText('414')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '充值积分' })).toBeEnabled();
  expect(screen.queryByText(/充值暂不可用/)).not.toBeInTheDocument();
});

it('shows cached credits immediately while a slow request refreshes the balance', async () => {
  const value = service(); let finish!: (result: GatewayBillingSummary) => void;
  value.getCachedSummary = vi.fn(id => id === account.account!.id ? summary : undefined);
  vi.mocked(value.getSummary).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(page(value));
  expect(screen.getByText('414')).toBeInTheDocument();
  expect(screen.queryByText('正在加载积分')).not.toBeInTheDocument();
  expect(screen.getByText(/上次更新/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '刷新积分' })).toBeDisabled();
  await act(async () => finish({ ...summary, balance: { ...summary.balance, availableUnits: '8000000' } }));
  expect(screen.getByText('8')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '刷新积分' })).toBeEnabled();
  await userEvent.setup().click(screen.getByRole('button', { name: '刷新积分' }));
  expect(value.getSummary).toHaveBeenCalledTimes(2);
  expect(await screen.findByText('414')).toBeInTheDocument();
});

it('keeps cached credits visible after a failed refresh and isolates another account', async () => {
  const value = service();
  value.getCachedSummary = vi.fn(id => id === account.account!.id ? summary : undefined);
  vi.mocked(value.getSummary).mockRejectedValue(new Error('offline'));
  const view = render(page(value));
  expect(screen.getByText('414')).toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('积分信息加载失败');
  expect(screen.getByText('414')).toBeInTheDocument();
  await act(async () => view.rerender(page(value, vi.fn(), { ...account, account: { ...account.account!, id: 'account-b' } })));
  expect(screen.queryByText('414')).not.toBeInTheDocument();
});

it('falls back to the existing website when an older gateway lacks handoffs', async () => {
  const value = service(); const open = vi.fn();
  vi.mocked(value.openWebAccount!).mockRejectedValue(new ApiClientError({ status: 404, code: 'GATEWAY_UNAVAILABLE', message: 'Not found' }));
  render(page(value, open)); expect(await screen.findByText('414')).toBeInTheDocument();
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
  render(page(value, open)); expect(await screen.findByText('414')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('网页未打开');
  expect(open).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(open).toHaveBeenCalledWith(handoff);
});

it('does not claim success when returning without a confirmed order', async () => {
  const value = service(); render(page(value)); expect(await screen.findByText('414')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(screen.queryByText(/充值成功/)).not.toBeInTheDocument();
  expect(value.getOrder).not.toHaveBeenCalled();
});

it('finds a new website order on focus and distinguishes payment from credit completion', async () => {
  const value = service(); render(page(value)); expect(await screen.findByText('414')).toBeInTheDocument();
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
  expect(screen.getByText('2914')).toBeInTheDocument();
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
  render(page(value)); expect(await screen.findByText('414')).toBeInTheDocument();
  await waitFor(() => expect(value.getOrders).toHaveBeenCalled());
  expect(value.getOrder).not.toHaveBeenCalled();
});

it('ignores a website response from the previous account', async () => {
  const value = service(); const open = vi.fn(); let finish!: (value: { url: string }) => void;
  vi.mocked(value.openWebAccount!).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(page(value, open)); expect(await screen.findByText('414')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  view.rerender(page(value, open, { ...account, account: { id: 'account-b', email: 'other@example.test', verified: true } }));
  await act(async () => finish({ url: handoff }));
  expect(open).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('opencreator:billing-visit:account-a')).toBeNull();
});
