import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
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
  const l = useLocalizedCopy();
  const status = props.codexStatus;
  const diagnostics = status?.diagnostics ?? [];

  return (
    <section className="settings-section settings-management diagnostics-settings" aria-labelledby="settings-diagnostics-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-diagnostics-title">{l("诊断", "diagnosis")}</h1>
          <p>{l("查看本地 Runtime、Codex 路径、能力矩阵和当前告警。", "View the local runtime, Codex path, capability matrix and current alarms.")}</p>
        </div>
      </header>

      {!props.connected ? (
        <p className="settings-notice">{l("本地服务未连接，诊断状态可能已过期。", "The local service is not connected and the diagnostic status may be out of date.")}</p>
      ) : null}
      <RuntimeRecoveryNotice diagnostics />

      <div className="diagnostics-overview">
        <section>
          <SquareTerminal aria-hidden="true" size={18} />
          <span>Runtime</span>
          <strong>{props.connected ? l("已连接", "Connected") : l("等待连接", "Waiting for connection")}</strong>
          <small>{props.runtimeVersion ?? l("版本未知", "Unknown version")}</small>
        </section>
        <section>
          <HardDrive aria-hidden="true" size={18} />
          <span>Codex Home</span>
          <strong>{status?.codexHomeWritable ? l("可写", "writable") : status ? l("只读", "Read only") : l("等待连接", "Waiting for connection")}</strong>
          <small>{status?.codexHomeMode ?? l("未知模式", "Unknown mode")}</small>
        </section>
      </div>

      <section className="diagnostics-block" aria-labelledby="diagnostics-runtime-title">
        <h2 id="diagnostics-runtime-title">{l("版本与运行目录", "Version and running directory")}</h2>
        <dl>
          <dt>{l("Runtime 版本", "Runtime version")}</dt>
          <dd>{props.runtimeVersion ?? l("未知", "unknown")}</dd>
          <dt>{l("Codex CLI 版本", "Codex CLI version")}</dt>
          <dd>{status?.codexVersion ?? l("未知", "unknown")}</dd>
          <dt>{l("Codex CLI 路径", "Codex CLI path")}</dt>
          <dd><code>{status?.codexBin ?? l("未连接", "Not connected")}</code></dd>
          <dt>CODEX_HOME</dt>
          <dd><code>{status?.codexHome ?? l("未连接", "Not connected")}</code></dd>
          <dt>{l("配置来源", "Configuration source")}</dt>
          <dd>{status ? `${status.codexHomeMode} · ${status.codexHomeSource}` : l("未知", "unknown")}</dd>
          <dt>{l("后台可用性验证", "Backend availability verification")}</dt>
          <dd>{availabilityProbeLabel(l, status?.availabilityProbe?.status)}</dd>
        </dl>
      </section>

      <section className="diagnostics-block" aria-labelledby="diagnostics-capabilities-title">
        <h2 id="diagnostics-capabilities-title">Capabilities</h2>
        <pre>{stringify(status?.capabilities ?? {})}</pre>
      </section>

      <section className="diagnostics-block" aria-labelledby="diagnostics-warnings-title">
        <h2 id="diagnostics-warnings-title">{l("日志告警", "Log alarm")}</h2>
        {diagnostics.length === 0 ? (
          <div className="diagnostics-empty">
            <CheckCircle2 aria-hidden="true" size={17} />
            {l("当前没有诊断告警", "There are currently no diagnostic alerts")}</div>
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
    return '[无法序列化 Capabilities]';
  }
}

function availabilityProbeLabel(l: LocalizeCopy,
  status: CodexAvailabilityProbe['status'] | undefined
): string {
  switch (status) {
    case 'pending':
      return l("检查中", "Under inspection");
    case 'succeeded':
      return l("可正常调用", "Can be called normally");
    case 'failed':
      return l("调用失败，请查看告警", "The call failed, please check the alarm");
    case 'skipped':
      return l("本次已跳过", "This time has been skipped");
    default:
      return l("未知", "unknown");
  }
}
