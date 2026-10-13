import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink, Upload, X } from 'lucide-react';
import type { YouTubeConnectionState } from '@opencreator/protocol';
import type { PlatformConnectionsService } from '../../services/platform-connections-service.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import './platform-connections.css';

export function PlatformConnectionsSettingsView(props: { connected: boolean; service?: PlatformConnectionsService | null }) {
  const l = useLocalizedCopy();
  const [state, setState] = useState<YouTubeConnectionState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [selectedProfile, setSelectedProfile] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const service = props.service;
    if (!props.connected || !service) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = requestVersion.current;
      try {
        const next = await service.getYouTube();
        if (!canceled && version === requestVersion.current) { setState(next); setError(undefined); }
      } catch { if (!canceled) setError(l('无法读取连接状态，请重试。', 'Unable to read connection status. Try again.')); }
      if (!canceled) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { canceled = true; clearTimeout(timer); };
  }, [props.connected, props.service, l]);

  async function act(operation: () => Promise<YouTubeConnectionState>) {
    setBusy(true); setError(undefined); ++requestVersion.current;
    try { setState(await operation()); }
    catch { setError(l('操作未完成，请检查网络或重新连接。', 'The operation failed. Check your network or reconnect.')); }
    finally { ++requestVersion.current; setBusy(false); }
  }

  const service = props.service;
  const disabled = !props.connected || !service || !state || busy;
  const connecting = state?.status === 'connecting';
  const connected = state?.status === 'connected';
  const managed = state?.connectionMethod === 'browser-login';
  const profiles = managed ? [] : state?.profiles ?? [];
  const profileId = profiles.some(profile => profile.id === selectedProfile) ? selectedProfile
    : profiles.find(profile => profile.id === state?.profileId)?.id ?? profiles[0]?.id;
  const awaitingLogin = connecting && !!state?.actionRequired;
  const label = connected ? l('已连接', 'Connected') : connecting ? state?.message ?? l('正在读取浏览器登录态', 'Reading browser session')
    : state?.status === 'expired' ? l('登录已过期', 'Session expired') : state?.status === 'error' ? l('连接失败', 'Connection failed')
    : l('未连接', 'Disconnected');

  async function connect() {
    if (!service || disabled) return;
    void act(() => service.connectYouTube(profileId));
  }

  return <section className="settings-section" aria-labelledby="platform-connections-title">
    <header><h1 id="platform-connections-title">{l('平台连接', 'Platform connections')}</h1></header>
    <div className="platform-connection-row">
      <div className="platform-connection-identity">
        <img src="/youtube.ico" width="36" height="36" alt="" />
        <div><h2>YouTube</h2><span className={`platform-connection-status${connected ? ' is-connected' : ''}`} role="status">
          {connected ? <CheckCircle2 size={15} /> : connecting ? <Loader2 size={15} className="platform-connection-spinner" /> : null}{label}</span></div>
      </div>
      <div className="platform-connection-actions">
        {profiles.length ? <select aria-label={l('浏览器账号', 'Browser profile')} value={profileId} disabled={disabled || connecting}
          onChange={event => setSelectedProfile(event.target.value)}>
          {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
        </select> : null}
        {awaitingLogin ? <button type="button" disabled={disabled} onClick={() => service && void act(service.completeYouTubeLogin)}>
          <CheckCircle2 size={16} />{l('完成登录', 'Finish sign-in')}</button> : null}
        {connecting ? <button type="button" disabled={disabled} onClick={() => service && void act(service.cancelYouTube)}><X size={16} />{l('取消', 'Cancel')}</button>
          : <button type="button" disabled={disabled} onClick={() => void connect()}>
            {connected || state?.status === 'expired' ? <RefreshCw size={16} /> : <Link2 size={16} />}
            {connected || state?.status === 'expired' ? l('重新连接', 'Reconnect') : l('连接', 'Connect')}</button>}
        {connected || state?.status === 'expired' ? <button type="button" disabled={disabled} onClick={() => service && void act(service.disconnectYouTube)}><Unlink size={16} />{l('断开', 'Disconnect')}</button> : null}
        {!connecting ? <button type="button" disabled={disabled} aria-label={l('导入 Cookie 文件', 'Import cookie file')} title={l('导入 Cookie 文件', 'Import cookie file')} onClick={() => fileInput.current?.click()}><Upload size={16} /></button> : null}
      </div>
    </div>
    {state?.message && !connecting ? <p role="status">{state.message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <input ref={fileInput} type="file" accept=".txt" hidden onChange={event => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
      if (!file || !service) return;
      if (file.size > 1024 * 1024) { setError(l('文件过大，请选择有效的 Cookie 文件。', 'The file is too large. Select a valid cookie file.')); return; }
      void act(async () => service.importYouTube(await file.text()));
    }} />
  </section>;
}
