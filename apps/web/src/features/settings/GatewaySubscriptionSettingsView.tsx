import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CreditCard, ExternalLink, HelpCircle, LoaderCircle, MessageSquare, ReceiptText, RefreshCw, Sparkles, X } from 'lucide-react';
import type { GatewayAccountState } from '@opencreator/protocol';
import type { ExternalNavigation } from '../../host/bridge.js';
import type { GatewayAccountSettingsService, GatewayBillingSummary, GatewayRechargeOrder, GatewayWebDestination } from '../../services/gateway-account-service.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { ApiClientError } from '../../runtime/errors.js';
import { formatGatewayCredits, GatewayAccountSettingsView } from './GatewayAccountSettingsView.js';
import { billingUnavailableMessage, creditPlansURL, rechargeOrderLabel, rechargeOrderStatus } from '../account/billing-display.js';
import './gateway-account-settings.css';
import '../account/credits.css';

type PortalVisit = { startedAt: number; knownOrders?: string[]; orderId?: string };
const visitKey = (id: string) => `opencreator:billing-visit:${id}`;
function readVisit(id?: string): PortalVisit | undefined {
  if (!id) return;
  try {
    const value = JSON.parse(sessionStorage.getItem(visitKey(id)) ?? 'null');
    if (value && typeof value.startedAt === 'number' && Date.now() - value.startedAt < 2 * 60 * 60 * 1000
      && (!value.orderId || /^[A-Za-z0-9_-]{1,128}$/.test(value.orderId))
      && (!value.knownOrders || (Array.isArray(value.knownOrders) && value.knownOrders.every((item: unknown) => typeof item === 'string')))) return value;
  } catch { /* The current visit still works without browser storage. */ }
}

export function GatewaySubscriptionSettingsView(props: {
  service: GatewayAccountSettingsService | null;
  embedded?: boolean;
  accountState?: GatewayAccountState;
  billingOrderId?: string;
  billingReturnUrl?: string;
  prepareExternalNavigation?(): ExternalNavigation;
  openExternal?(url: string): Promise<void> | void;
  onStateChange?(state: GatewayAccountState): void;
  onRequestSignIn?(): void;
}) {
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  const [state, setState] = useState(props.accountState);
  const account = props.embedded ? props.accountState : state;
  const accountId = account?.authState === 'signed_in' ? account.account?.id : undefined;
  const [summary, setSummary] = useState<GatewayBillingSummary>();
  const [refreshing, setRefreshing] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [webError, setWebError] = useState(false);
  const [orderError, setOrderError] = useState(false);
  const [opening, setOpening] = useState<GatewayWebDestination>();
  const [order, setOrder] = useState<GatewayRechargeOrder>();
  const [signInRequest, setSignInRequest] = useState(0);
  const generation = useRef(0);
  const working = useRef(false);
  const webWorking = useRef(false);
  const visit = useRef<PortalVisit>();
  const dismissedOrder = useRef<string>();
  const service = props.service;
  const plansURL = creditPlansURL(summary?.plansUrl, language);

  function saveVisit(value?: PortalVisit) {
    visit.current = value;
    if (accountId) try {
      if (value) sessionStorage.setItem(visitKey(accountId), JSON.stringify(value));
      else sessionStorage.removeItem(visitKey(accountId));
    } catch { /* Optional recovery storage. */ }
  }
  async function refresh() {
    if (!service || !accountId || working.current) return;
    working.current = true; setRefreshing(true);
    const request = generation.current;
    try {
      const value = await service.getSummary();
      if (request !== generation.current) return;
      setSummary(value); setBalanceError(false);
    } catch { if (request === generation.current) setBalanceError(true); }
    const tracked = visit.current;
    const requestedOrder = props.billingOrderId ?? tracked?.orderId;
    if (tracked || requestedOrder) try {
      let id = requestedOrder;
      if (!id && tracked) {
        const result = await service.getOrders();
        if (request !== generation.current) return;
        id = [...result.items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .find(item => tracked.knownOrders ? !tracked.knownOrders.includes(item.id) : Date.parse(item.createdAt) >= tracked.startedAt)?.id;
        if (id) saveVisit({ ...tracked, orderId: id });
      }
      if (id && id !== dismissedOrder.current) {
        const result = await service.getOrder(id);
        if (request !== generation.current) return;
        setOrder(result.order); setOrderError(false);
        if (rechargeOrderStatus(result.order) === 'completed') {
          const updated = await service.getSummary();
          if (request !== generation.current) return;
          setSummary(updated); setBalanceError(false);
          saveVisit();
        }
      }
    } catch { if (request === generation.current) setOrderError(true); }
    if (request === generation.current) { working.current = false; setRefreshing(false); }
  }
  useEffect(() => {
    generation.current++; working.current = false; webWorking.current = false;
    visit.current = readVisit(accountId); dismissedOrder.current = undefined;
    setSummary(undefined); setOrder(undefined); setOpening(undefined); setBalanceError(false); setWebError(false); setOrderError(false);
    void refresh();
    const onReturn = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(onReturn, 15_000);
    window.addEventListener('focus', onReturn); document.addEventListener('visibilitychange', onReturn);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [service, accountId, props.billingOrderId]);
  useEffect(() => {
    if (!order || !['pending', 'processing'].includes(rechargeOrderStatus(order))) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 3_000);
    return () => clearInterval(timer);
  }, [order?.id, order?.status]);

  function fallbackURL(destination: GatewayWebDestination) {
    if (!plansURL) throw new Error('Account website is unavailable');
    const url = new URL(plansURL);
    if (destination === 'account') url.pathname = '/account';
    if (destination === 'usage') url.hash = 'usage';
    if (destination === 'faq') url.hash = 'faq-title';
    if (accountId) url.searchParams.set('account', accountId);
    url.searchParams.set('from', 'app');
    if (props.billingReturnUrl) url.searchParams.set('returnTo', props.billingReturnUrl);
    return url.href;
  }
  async function openWeb(destination: GatewayWebDestination) {
    if (webWorking.current) return;
    webWorking.current = true; setOpening(destination); setWebError(false);
    const request = generation.current;
    let navigation: ExternalNavigation | undefined;
    try {
      navigation = props.prepareExternalNavigation?.();
      let url = fallbackURL(destination);
      if (accountId && service?.openWebAccount) {
        try {
          const result = await service.openWebAccount(destination, language === 'zh-CN' ? 'zh' : 'en');
          const target = new URL(result.url);
          if (!plansURL || target.origin !== new URL(plansURL).origin || target.pathname !== '/auth' || !/^#handoff=[A-Za-z0-9_-]{32,128}$/.test(target.hash) || target.username || target.password) throw new Error('Invalid account link');
          url = target.href;
        } catch (error) {
          // Older gateways keep the existing website usable during the rollout.
          if (!(error instanceof ApiClientError && error.status === 404)) throw error;
        }
      }
      if (request !== generation.current) { navigation?.close(); return; }
      if (accountId && service && destination === 'recharge') {
        const startedAt = Date.now();
        let knownOrders: string[] | undefined;
        try { knownOrders = (await service.getOrders()).items.map(item => item.id); } catch { /* Match new orders by their creation time if history is unavailable. */ }
        if (request !== generation.current) { navigation?.close(); return; }
        saveVisit({ startedAt, knownOrders }); setOrder(undefined); dismissedOrder.current = undefined;
      }
      if (navigation) navigation.navigate(url);
      else if (props.openExternal) await props.openExternal(url);
      else { window.open(url, '_blank', 'noopener,noreferrer'); }
    } catch { navigation?.close(); if (request === generation.current) { setWebError(true); if (destination === 'recharge') saveVisit(); } }
    finally { if (request === generation.current) { webWorking.current = false; setOpening(undefined); } }
  }
  const status = order ? rechargeOrderStatus(order) : undefined;
  const paymentMessage = order && status === 'completed' ? l(`充值成功，已到账 ${formatGatewayCredits(order.creditUnits)} 积分`, `Recharge complete. ${formatGatewayCredits(order.creditUnits)} credits added.`)
    : status === 'processing' ? l('付款成功，积分到账中', 'Payment received. Credits are being added.')
    : order ? rechargeOrderLabel(order, l) : '';

  return <section className="account-credits" aria-label={l('积分与充值', 'Credits')}>
    {!props.embedded ? <GatewayAccountSettingsView service={service} variant="login" signInRequest={signInRequest} openExternal={props.openExternal} onStateChange={value => { setState(value); props.onStateChange?.(value); }}/> : null}
    <div className="account-credits__balance">
      <div><h2>{l('可用积分', 'Available credits')}</h2>
        {accountId ? <p className="account-credits__value">{summary ? formatGatewayCredits(summary.balance.availableUnits) : '--'} <small>{l('积分', 'credits')}</small></p>
          : <p className="credit-muted">{l('登录后查看积分', 'Sign in to view your credits')}</p>}
        {accountId && !summary && refreshing ? <p className="credit-loading" role="status"><LoaderCircle size={14}/>{l('正在加载积分', 'Loading credits')}</p> : null}
        {balanceError && summary ? <p className="credit-muted">{l('上次更新', 'Last updated')} {new Date(summary.balance.asOf).toLocaleString(language)}</p> : null}
      </div>
      <div className="account-credits__actions">
        {accountId ? <button type="button" className="credit-icon-button" title={l('刷新积分', 'Refresh credits')} aria-label={l('刷新积分', 'Refresh credits')} disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={17} className={refreshing ? 'is-spinning' : ''}/></button> : null}
        <button type="button" className="credit-primary" disabled={!!opening || !plansURL} onClick={() => void openWeb('recharge')}>
          {opening === 'recharge' ? <LoaderCircle size={16} className="is-spinning"/> : <CreditCard size={16}/>}{l('充值积分', 'Buy credits')}<ExternalLink size={14}/>
        </button>
      </div>
    </div>
    {balanceError ? <p className="credit-error" role="alert">{l('积分信息加载失败，请刷新重试。', 'Credits could not be loaded. Refresh to try again.')}</p> : null}
    {summary?.paymentReview ? <p className="credit-notice" role="status">{billingUnavailableMessage('payment_review', l)}</p> : null}
    {orderError ? <p className="credit-error" role="alert">{l('暂时无法确认订单，请刷新重试，勿重复付款。', 'Your order could not be confirmed. Refresh to try again; do not pay again.')}</p> : null}
    {order ? <div className={`account-payment${status === 'completed' ? ' is-completed' : ''}`}><div>{status === 'completed' ? <CircleCheck size={18}/> : <CreditCard size={18}/>}<span role="status">{paymentMessage}</span></div><button type="button" className="credit-icon-button" title={l('关闭付款提示', 'Dismiss payment status')} aria-label={l('关闭付款提示', 'Dismiss payment status')} onClick={() => { dismissedOrder.current = order.id; saveVisit(); setOrder(undefined); setOrderError(false); }}><X size={16}/></button></div> : null}
    {webError ? <p className="credit-error" role="alert">{l('网页未打开，请重试。', 'The website could not be opened. Try again.')}</p> : null}
    <nav className="account-credits__links" aria-label={l('账户与帮助', 'Account and help')}>
      <button type="button" disabled={!!opening || !plansURL} onClick={() => void openWeb('account')}><ReceiptText size={17}/><span>{l('账单与充值记录', 'Billing and recharge history')}</span><ExternalLink size={14}/></button>
      <button type="button" disabled={!!opening || !plansURL} onClick={() => void openWeb('usage')}><Sparkles size={17}/><span>{l('积分用量估算', 'Estimate credit usage')}</span><ExternalLink size={14}/></button>
      <button type="button" disabled={!!opening || !plansURL} onClick={() => void openWeb('faq')}><HelpCircle size={17}/><span>FAQ</span><ExternalLink size={14}/></button>
      <a href="https://github.com/krillinai/OpenCreator/issues" target="_blank" rel="noreferrer" onClick={props.openExternal ? event => { event.preventDefault(); void Promise.resolve(props.openExternal!('https://github.com/krillinai/OpenCreator/issues')).catch(() => setWebError(true)); } : undefined}><MessageSquare size={17}/><span>{l('问题反馈', 'Report an issue')}</span><ExternalLink size={14}/></a>
    </nav>
  </section>;
}
