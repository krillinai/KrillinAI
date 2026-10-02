import type { CodexImageStatus } from '@opencreator/protocol';
import { useEffect, useState } from 'react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';

export function CodexImageStatusNotice(props: {
  service: CreatorServicesSettingsService | null;
  onOpenAgentSetup?(): void;
}) {
  const localize = useLocalizedCopy();
  const [status, setStatus] = useState<CodexImageStatus>();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const readStatus = props.service?.getCodexImageStatus;
  useEffect(() => {
    let active = true;
    setStatus(undefined);
    setFailed(false);
    setLoading(Boolean(readStatus));
    if (!readStatus) return;
    void readStatus().then(value => {
      if (active) setStatus(value);
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [readStatus, refreshToken]);
  useEffect(() => {
    const refresh = () => setRefreshToken(value => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  return <div className={`creator-services-inline-note${status?.ready ? '' : ' is-warning'}`} role="status" aria-live="polite">
    <strong>{loading ? localize('正在检查 Codex 生图配置…', 'Checking Codex image configuration…')
      : status?.authentication === 'chatgpt' ? localize('ChatGPT 登录态 · 原生生图', 'ChatGPT sign-in · Native image generation')
        : status?.authentication === 'api_key' ? localize('API Key · 图片接口', 'API key · Image API')
          : localize('Codex 生图尚未就绪', 'Codex image generation is not ready')}</strong>
    <p>{failed ? localize('无法读取生图状态，请检查 Runtime 连接后重试。', 'Cannot read image status. Check the Runtime connection and retry.')
      : status?.message ?? (!readStatus ? localize('当前 Runtime 无法检查生图能力，请更新 Runtime。', 'This Runtime cannot check image capabilities. Update the Runtime.') : '')}</p>
    {status?.version ? <p>{localize('Runtime 版本', 'Runtime version')}: {status.version}</p> : null}
    {status?.ready ? <p>{localize('这里只检查本地配置和工具能力，不会执行生图请求；账号权限、额度及接口可用性以实际生成结果为准。', 'This checks local configuration and tool support without generating an image. Account access, quota, and API availability are verified during generation.')}</p> : null}
    <div className="creator-services-codex-image-actions">
      {readStatus ? <button type="button" className="settings-secondary-button" disabled={loading} onClick={() => setRefreshToken(value => value + 1)}>{localize('刷新状态', 'Refresh status')}</button> : null}
      {props.onOpenAgentSetup ? <button type="button" className="settings-secondary-button" onClick={props.onOpenAgentSetup}>{localize('配置 Agent', 'Set up Agent')}</button> : null}
    </div>
  </div>;
}
