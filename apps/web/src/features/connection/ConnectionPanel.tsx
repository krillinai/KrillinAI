import type { CodexStatusResponse } from '@opencreator/protocol';

export function ConnectionPanel(props: {
  status: 'connected' | 'disconnected' | 'invalid_token';
  codexStatus?: CodexStatusResponse;
  message?: string;
  onRetry?(): void;
}) {
  const title =
    props.status === 'connected'
      ? `Connected ${props.codexStatus?.codexVersion ?? 'unknown'}`
      : props.status === 'invalid_token'
        ? 'Runtime authorization is not ready'
        : 'Waiting for the local Runtime';
  const message =
    props.status === 'connected'
      ? props.codexStatus?.codexHome
      : props.status === 'invalid_token'
        ? 'The local Runtime handshake failed. Check again.'
        : props.message !== undefined && props.message !== title
          ? props.message
          : 'OpenCreator connects to the local Codex Runtime automatically.';

  return (
    <div className="connection-panel" aria-label="Runtime connection status">
      <div className="panel-header">
        <div className="connection-status">
          <span className={`connection-status-dot ${props.status}`} aria-hidden="true" />
          <span>{title}</span>
        </div>
      </div>
      <div className="connection-summary">
        {message ? <p>{message}</p> : null}
        <button type="button" onClick={props.onRetry}>
          Retry detection
        </button>
      </div>
    </div>
  );
}
