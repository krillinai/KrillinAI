import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { GatewayAccountState, GatewayActivationStage } from '@opencreator/protocol';
import type { GatewayAccountSettingsService } from '../../services/gateway-account-service.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import './official-services-settings.css';

export function OfficialServiceRecovery(props: {
  state: GatewayAccountState;
  service: GatewayAccountSettingsService;
  onChange(state: GatewayAccountState): void;
}) {
  const l = useLocalizedCopy();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => {
    setPending(false); setError('');
    return () => { request.current++; };
  }, [props.state.account?.id, props.state.authState, props.state.source, props.service]);
  if (props.state.authState !== 'signed_in' || props.state.source !== 'gateway' || props.state.activationState === 'ready') return null;
  const failure = props.state.activationError;
  const stages: Record<GatewayActivationStage, string> = {
    credentials: l('刷新登录凭据', 'Refreshing sign-in credentials'),
    usage: l('同步设备状态', 'Syncing device state'),
    bootstrap: l('获取模型凭据', 'Retrieving model credentials'),
    catalog: l('获取模型列表', 'Loading the model catalog'),
    runtime: l('连接本地运行时', 'Connecting the local runtime'),
    configuration: l('保存服务配置', 'Saving service configuration')
  };
  const reason = failure?.request?.reason === 'timeout' ? l('网关请求超时，请检查网络后重试。', 'The gateway request timed out. Check your connection and try again.')
    : failure?.request?.reason === 'network' ? l('无法连接网关，请检查网络或代理后重试。', 'Could not reach the gateway. Check your network or proxy and try again.')
    : failure?.request?.reason === 'http' ? l('网关返回错误，请稍后重试。', 'The gateway returned an error. Try again later.')
    : failure?.request?.reason === 'invalid_response' ? l('网关返回的数据无效，请稍后重试。', 'The gateway returned an invalid response. Try again later.')
    : failure?.code === 'model_catalog_unavailable' ? l('模型列表暂时无法获取，请重试。', 'The model catalog is temporarily unavailable. Try again.')
    : failure?.code === 'no_available_models' ? l('当前没有可用的文本模型。', 'No compatible text models are available.')
    : l('官方模型服务连接失败，请重新连接。', 'Official model services could not connect. Reconnect to try again.');
  const diagnostic = [failure?.stage ? stages[failure.stage] : '', failure?.code, failure?.request?.path,
    failure?.request?.httpStatus ? `HTTP ${failure.request.httpStatus}` : '', failure?.request?.networkCode].filter(Boolean).join(' · ');
  const connecting = pending || props.state.activationState === 'loading';
  return <div className="official-service-recovery">
    {failure || error ? <p role="alert">{error || reason}{diagnostic ? <small>{diagnostic}</small> : null}</p> : null}
    <button type="button" disabled={connecting} onClick={() => {
      const sequence = ++request.current;
      setPending(true); setError('');
      void props.service.activate().then(next => {
        if (sequence === request.current && next.account?.id === props.state.account?.id) props.onChange(next);
      }).catch(() => {
        if (sequence === request.current) setError(l('重新连接失败，请稍后重试。', 'Could not reconnect. Try again later.'));
      }).finally(() => { if (sequence === request.current) setPending(false); });
    }}>
      {connecting ? <LoaderCircle size={15} className="official-services-spinner" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
      {connecting ? l('正在连接', 'Connecting') : l('重新连接', 'Reconnect')}
    </button>
  </div>;
}
