import { safePublicErrorMessage } from '@opencreator/protocol';
import { ApiClientError } from '../runtime/errors.js';

export function modelProbeErrorMessage(error: unknown, l: (zh: string, en: string) => string): string | undefined {
  const code = error instanceof ApiClientError ? error.details?.gatewayCode : undefined;
  if (typeof code !== 'string' || !code.startsWith('model_probe_')) return undefined;
  const message = code === 'model_probe_failed'
    ? l('该模型当前不可用，请选择其他模型', 'This model is currently unavailable. Choose another model.')
    : code === 'model_probe_auth_required'
      ? l('模型凭证已失效，请重新连接官方服务', 'Model credentials have expired. Reconnect official services.')
      : code === 'model_probe_unavailable'
        ? l('模型检测暂不可用，请稍后重试', 'Model checks are temporarily unavailable. Try again later.')
        : code === 'model_probe_credits_insufficient'
          ? l('积分不足或模型额度已用完，请充值后重试', 'Insufficient credits or model quota. Add credits and try again.')
          : l('暂时无法确认模型可用性，请重试', 'Model availability could not be confirmed. Try again.');
  const facts = error instanceof ApiClientError ? error.details?.publicFacts : undefined;
  const reason = facts && typeof facts === 'object' && 'upstreamMessage' in facts ? facts.upstreamMessage : undefined;
  const safeReason = safePublicErrorMessage(reason);
  return safeReason ? `${message}\n${safeReason}` : message;
}
