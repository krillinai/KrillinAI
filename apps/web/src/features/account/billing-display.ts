import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import type { GatewayBillingAvailability, GatewayRechargeOrder } from '../../services/gateway-account-service.js';

export function formatGatewayCredits(units: string) {
  if (!/^\d+$/.test(units)) return '?';
  const value = BigInt(units);
  if (value > 0n && value < 1_000_000n) return '<1';
  return `${(value + 500_000n) / 1_000_000n}`;
}

export function formatGatewayCreditAmount(amount: number | undefined) {
  if (amount === undefined || !Number.isFinite(amount)) return '?';
  if (amount > 0 && amount < 1) return '<1';
  return `${Math.round(amount)}`;
}

export function billingUnavailableMessage(reason: GatewayBillingAvailability['billingUnavailableReason'], l: LocalizeCopy) {
  switch (reason) {
    case 'purchases_disabled': return l('当前环境暂未开放充值，仍可查看积分方案。', 'Purchases are not enabled in this environment. Credit plans are available to browse.');
    case 'payment_service_unavailable': return l('支付服务暂不可用，请稍后重试。', 'The payment service is unavailable. Try again later.');
    case 'official_services_unavailable': return l('官方积分服务暂不可用，充值已暂停。', 'Official credit services are unavailable. Purchases are paused.');
    case 'payment_review': return l('付款正在审核，充值和积分使用已暂停，请联系客服。', 'Your payment is under review. Purchases and credit usage are paused. Contact support.');
    default: return l('充值暂不可用，仍可查看积分方案。', 'Purchases are currently unavailable. Credit plans are available to browse.');
  }
}

export function formatBillingMoney(units: string, currency: string, language: string) {
  if (!/^\d+$/.test(units) || !Number.isSafeInteger(Number(units))) return '—';
  try { return new Intl.NumberFormat(language, { style: 'currency', currency: currency.toUpperCase() }).format(Number(units) / 100); }
  catch { return '—'; }
}

export function rechargeOrderStatus(order: GatewayRechargeOrder) {
  if (order.reviewRequired) return 'review';
  if (order.status === 'pending' && order.expiresAt && new Date(order.expiresAt).getTime() <= Date.now()) return 'expired';
  return order.status;
}

export function rechargeOrderLabel(order: GatewayRechargeOrder, l: LocalizeCopy) {
  switch (rechargeOrderStatus(order)) {
    case 'pending': return l('待付款', 'Awaiting payment');
    case 'processing': return l('积分到账中', 'Adding credits');
    case 'completed': return l('已到账', 'Completed');
    case 'expired': return l('已过期', 'Expired');
    case 'failed': return l('付款失败', 'Payment failed');
    case 'refunded': return l('已退款', 'Refunded');
    case 'disputed': return l('付款争议处理中', 'Payment disputed');
    case 'review': return l('付款审核中', 'Under review');
    default: return l('等待确认', 'Awaiting confirmation');
  }
}

export function creditPlansURL(raw: string | undefined, language: string) {
  try {
    const url = new URL(raw || 'https://www.open-creator.ai/pricing');
    const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.pathname !== '/pricing') return undefined;
    url.searchParams.set('lang', language === 'zh-CN' ? 'zh' : 'en');
    return url.href;
  } catch { return undefined; }
}

export function checkedPaymentURL(raw: string, plansURL?: string) {
  const url = new URL(raw);
  if (url.username || url.password) throw new Error('Invalid payment URL');
  if (url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && url.port === '' && url.pathname.startsWith('/')) return url.href;
  if (plansURL && url.origin === new URL(plansURL).origin && url.pathname === '/billing/return') return url.href;
  throw new Error('Invalid payment URL');
}
