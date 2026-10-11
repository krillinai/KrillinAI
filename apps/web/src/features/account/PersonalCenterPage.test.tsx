import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayAccountState } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import type { GatewayAccountSettingsService, GatewayBillingSummary } from '../../services/gateway-account-service.js';
import PersonalCenterPage from './PersonalCenterPage.js';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const signedOut: GatewayAccountState = { source: 'manual', authState: 'signed_out', activationState: 'inactive', account: null, bindingVersion: null, models: [], activationError: null };
const signedIn: GatewayAccountState = { ...signedOut, source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@example.test', verified: true } };
const summary: GatewayBillingSummary = { balance: { availableUnits: '123000000', reservedUnits: '0', periodEnd: null, asOf: '2026-10-05T01:00:00Z' }, subscription: null, billingAvailable: true };
function createService(initial = signedIn): GatewayAccountSettingsService {
  return { getState: vi.fn(async () => initial), start: vi.fn(), cancel: vi.fn(), logout: vi.fn(async () => signedOut), activate: vi.fn(), setSource: vi.fn(), selectModel: vi.fn(), getBalance: vi.fn(), getSummary: vi.fn(async () => summary), getPlans: vi.fn(async () => ({ plans: [], billingAvailable: false })), getOrders: vi.fn(async () => ({ items: [] })), getOrder: vi.fn(), getCreditGrants: vi.fn(async () => ({ items: [] })), checkout: vi.fn(), portal: vi.fn() };
}
function page(service: GatewayAccountSettingsService | null, accountState?: GatewayAccountState, onBack = vi.fn(), openExternal = vi.fn(), view: 'account' | 'subscription' = 'account', onOpenModelSettings = vi.fn()) {
  return <LanguageProvider initialPreference="zh-CN"><PersonalCenterPage view={view} service={service} accountState={accountState} onBack={onBack} openExternal={openExternal} onOpenModelSettings={onOpenModelSettings}/></LanguageProvider>;
}
it('provides a single login action and a credits entry with no fabricated guest balance', async () => {
  const service = createService(signedOut); const open = vi.fn();
  render(page(service, signedOut, vi.fn(), open));
  expect(await screen.findByRole('button', { name: '登录 / 注册' })).toBeEnabled();
  expect(screen.getAllByRole('button', { name: '登录 / 注册' })).toHaveLength(1);
  await userEvent.setup().click(screen.getByRole('button', { name: '充值积分' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(open).toHaveBeenCalledWith(expect.stringContaining('/pricing?lang=zh'));
  expect(screen.queryByText('123')).not.toBeInTheDocument();
  expect(service.getSummary).not.toHaveBeenCalled();
});
it('keeps the old recharge route on the unified personal center', async () => {
  const service = createService(signedOut);
  render(page(service, signedOut, vi.fn(), vi.fn(), 'subscription'));
  expect(screen.getByRole('main', { name: '个人中心' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '充值积分' })).toBeEnabled();
  expect(service.checkout).not.toHaveBeenCalled();
  expect(service.getSummary).not.toHaveBeenCalled();
});
it('shows account and credits and returns to the previous view', async () => {
  const back = vi.fn();
  render(page(createService(), signedIn, back));
  expect(await screen.findByText('123')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'a@example.test' })).toBeInTheDocument();
  expect(screen.getByText('已登录', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText('未订阅')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '返回' }));
  expect(back).toHaveBeenCalledOnce();
});
it('loads credits immediately after login', async () => {
  const service = createService(signedOut); const open = vi.fn();
  vi.mocked(service.start).mockImplementation(async () => { vi.mocked(service.getState).mockResolvedValue(signedIn); return { attemptId: 'attempt', authorizationUrl: 'https://gateway.example/device', expiresAt: '2026-10-08T00:00:00Z' }; });
  render(page(service, signedOut, vi.fn(), open));
  await userEvent.setup().click(await screen.findByRole('button', { name: '登录 / 注册' }));
  expect(await screen.findByText('123')).toBeInTheDocument();
  expect(open).toHaveBeenCalledWith('https://gateway.example/device?lang=zh');
});
it('clears the balance after logout', async () => {
  const service = createService();
  vi.mocked(service.logout).mockImplementation(async () => { vi.mocked(service.getState).mockResolvedValue(signedOut); return signedOut; });
  render(page(service, signedIn, vi.fn(), vi.fn(), 'subscription'));
  expect(await screen.findByText('123')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByLabelText('账号菜单'));
  await userEvent.setup().click(screen.getByRole('button', { name: '退出登录' }));
  expect(await screen.findByRole('button', { name: '登录 / 注册' })).toBeInTheDocument();
  expect(screen.queryByText('123')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: '充值订单' })).not.toBeInTheDocument();
});
it('ignores a previous account balance response after switching accounts', async () => {
  const service = createService(); let complete!: (result: GatewayBillingSummary) => void;
  vi.mocked(service.getSummary).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const view = render(page(service, signedIn));
  await waitFor(() => expect(service.getSummary).toHaveBeenCalledOnce());
  const next = { ...signedIn, account: { id: 'b', email: 'b@example.test', verified: true } };
  vi.mocked(service.getState).mockResolvedValue(next);
  vi.mocked(service.getSummary).mockResolvedValue({ ...summary, balance: { ...summary.balance, availableUnits: '8000000' } });
  view.rerender(page(service, next));
  expect(await screen.findByText('8')).toBeInTheDocument();
  await act(async () => complete(summary));
  expect(screen.queryByText('123')).not.toBeInTheDocument();
});
it('shows unavailable login without an enabled action', () => {
  render(page(null));
  expect(within(screen.getByRole('region', { name: 'OpenCreator 账户' })).getByText('登录服务暂不可用')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '登录 / 注册' })).toBeDisabled();
});
it('keeps model availability separate from sign-in and opens model settings', async () => {
  const blocked = { ...signedIn, activationState: 'blocked' as const, activationError: { code: 'services_not_ready', message: 'Unavailable' } };
  const settings = vi.fn();
  render(page(createService(blocked), blocked, vi.fn(), vi.fn(), 'account', settings));
  expect(await screen.findByText('已登录', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('官方模型服务暂不可用')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: '模型设置' }));
  expect(settings).toHaveBeenCalledOnce();
});
