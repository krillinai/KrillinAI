import { useEffect, useState } from 'react';
import { ArrowLeft, Settings2 } from 'lucide-react';
import type { GatewayAccountState } from '@opencreator/protocol';
import type { ExternalNavigation } from '../../host/bridge.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { GatewayAccountSettingsService } from '../../services/gateway-account-service.js';
import { GatewayAccountSettingsView } from '../settings/GatewayAccountSettingsView.js';
import { GatewaySubscriptionSettingsView } from '../settings/GatewaySubscriptionSettingsView.js';
import { OfficialServiceRecovery } from '../settings/OfficialServiceRecovery.js';
import { AccountAvatar } from './AccountAvatar.js';
import './personal-center.css';

export default function PersonalCenterPage(props: {
  view?: 'account' | 'subscription';
  service: GatewayAccountSettingsService | null;
  accountState?: GatewayAccountState;
  hasActiveTasks?: boolean;
  billingOrderId?: string;
  billingReturnUrl?: string;
  prepareExternalNavigation?(): ExternalNavigation;
  onStateChange?(state: GatewayAccountState): void;
  openExternal?(url: string): Promise<void> | void;
  onBack(): void;
  onOpenModelSettings?(): void;
}) {
  const l = useLocalizedCopy();
  const [state, setState] = useState(props.accountState);
  const [signInRequest, setSignInRequest] = useState(0);
  useEffect(() => { setState(props.accountState); }, [props.accountState]);
  const email = state?.authState === 'signed_in' ? state.account?.email : undefined;
  const title = l('个人中心', 'Account');
  const modelUnavailable = state?.authState === 'signed_in' && state.source === 'gateway' && state.activationState !== 'ready';

  return <main className="opencreator-scroll-page personal-center" aria-label={title}>
    <div className="personal-center__content">
      <header className="personal-center__heading">
        <button type="button" onClick={props.onBack} title={l('返回', 'Back')} aria-label={l('返回', 'Back')}><ArrowLeft size={20}/></button>
        <h1>{title}</h1>
      </header>
      <section className="personal-center__identity" aria-label={l('账户信息', 'Account information')}>
        <AccountAvatar email={email} accountId={state?.account?.id} avatarUrl={state?.account?.avatarUrl} loadAvatar={props.service?.getAvatar} large/>
          <GatewayAccountSettingsView
            variant="profile"
            service={props.service}
            accountState={state}
            signInRequest={signInRequest}
            openExternal={props.openExternal}
            onStateChange={next => {
              setState(next); props.onStateChange?.(next);
            }}
          />
      </section>
      {modelUnavailable ? <div className="personal-center__model-status" role="status">
        <span>{state.activationState === 'loading' ? l('官方模型服务正在连接', 'Connecting to official model services')
          : state.activationError?.code === 'model_catalog_unavailable' ? l('模型列表暂时无法获取', 'The model list is temporarily unavailable')
          : state.activationError?.code === 'no_available_models' ? l('当前没有可用的文本模型', 'No compatible text models are available')
          : l('官方模型服务暂不可用', 'Official model services are unavailable')}</span>
        {props.onOpenModelSettings ? <button type="button" onClick={props.onOpenModelSettings}><Settings2 size={15}/>{l('模型设置', 'Model settings')}</button> : null}
      </div> : null}
      {modelUnavailable && props.service ? <OfficialServiceRecovery state={state} service={props.service} onChange={next => {
        setState(next); props.onStateChange?.(next);
      }} /> : null}
      <GatewaySubscriptionSettingsView
        key={`${state?.authState}:${state?.account?.id ?? ''}`}
        service={props.service} embedded accountState={state} openExternal={props.openExternal}
        hasActiveTasks={props.hasActiveTasks}
        billingOrderId={props.billingOrderId} billingReturnUrl={props.billingReturnUrl}
        prepareExternalNavigation={props.prepareExternalNavigation}
        onRequestSignIn={() => setSignInRequest(value => value + 1)}
      />
    </div>
  </main>;
}
