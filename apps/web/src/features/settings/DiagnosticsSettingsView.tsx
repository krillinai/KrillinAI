import type {
  CodexAvailabilityProbe,
  CodexStatusResponse
} from '@opencreator/protocol';
import { AlertTriangle, CheckCircle2, HardDrive, SquareTerminal } from 'lucide-react';
import { RuntimeRecoveryNotice } from '../../runtime/runtime-recovery.js';

export type DiagnosticsSettingsViewProps = {
  connected: boolean;
  runtimeVersion?: string;
  codexStatus?: CodexStatusResponse;
};

export function DiagnosticsSettingsView(props: DiagnosticsSettingsViewProps) {
  const status = props.codexStatus;
  const diagnostics = status?.diagnostics ?? [];

  return (
    <section className="settings-section settings-management diagnostics-settings" aria-labelledby="settings-diagnostics-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-diagnostics-title">Diagnostics</h1>
          <p>View the local Runtime, Codex paths, capabilities, and current warnings.</p>
        </div>
      </header>

      {!props.connected ? (
        <p className="settings-notice">The local Runtime is disconnected. Diagnostics may be out of date.</p>
      ) : null}
      <RuntimeRecoveryNotice diagnostics />

      <div className="diagnostics-overview">
        <section>
          <SquareTerminal aria-hidden="true" size={18} />
          <span>Runtime</span>
          <strong>{props.connected ? 'Connected' : 'Waiting for connection'}</strong>
          <small>{props.runtimeVersion ?? 'Unknown version'}</small>
        </section>
        <section>
          <HardDrive aria-hidden="true" size={18} />
          <span>Codex Home</span>
          <strong>{status?.codexHomeWritable ? 'Writable' : status ? 'Read only' : 'Waiting for connection'}</strong>
          <small>{status?.codexHomeMode ?? 'Unknown mode'}</small>
        </section>
      </div>

      <section className="diagnostics-block" aria-labelledby="diagnostics-runtime-title">
        <h2 id="diagnostics-runtime-title">Versions and Runtime directories</h2>
        <dl>
          <dt>Runtime version</dt>
          <dd>{props.runtimeVersion ?? 'Unknown'}</dd>
          <dt>Codex CLI version</dt>
          <dd>{status?.codexVersion ?? 'Unknown'}</dd>
          <dt>Codex CLI path</dt>
          <dd><code>{status?.codexBin ?? 'Disconnected'}</code></dd>
          <dt>CODEX_HOME</dt>
          <dd><code>{status?.codexHome ?? 'Disconnected'}</code></dd>
          <dt>Configuration source</dt>
          <dd>{status ? `${status.codexHomeMode} · ${status.codexHomeSource}` : 'Unknown'}</dd>
          <dt>Background availability check</dt>
          <dd>{availabilityProbeLabel(status?.availabilityProbe?.status)}</dd>
        </dl>
      </section>

      <section className="diagnostics-block" aria-labelledby="diagnostics-capabilities-title">
        <h2 id="diagnostics-capabilities-title">Capabilities</h2>
        <pre>{stringify(status?.capabilities ?? {})}</pre>
      </section>

      <section className="diagnostics-block" aria-labelledby="diagnostics-warnings-title">
        <h2 id="diagnostics-warnings-title">Log warnings</h2>
        {diagnostics.length === 0 ? (
          <div className="diagnostics-empty">
            <CheckCircle2 aria-hidden="true" size={17} />
            No diagnostic warnings
          </div>
        ) : (
          <ul className="diagnostics-warning-list">
            {diagnostics.map(diagnostic => (
              <li key={diagnostic}>
                <AlertTriangle aria-hidden="true" size={16} />
                <span>{diagnostic}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return '[Could not serialize capabilities]';
  }
}

function availabilityProbeLabel(
  status: CodexAvailabilityProbe['status'] | undefined
): string {
  switch (status) {
    case 'pending':
      return 'Checking';
    case 'succeeded':
      return 'Available';
    case 'failed':
      return 'Unavailable. Check warnings.';
    case 'skipped':
      return 'Skipped this time';
    default:
      return 'Unknown';
  }
}
