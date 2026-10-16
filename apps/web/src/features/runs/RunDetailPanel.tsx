import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type {
  AttachmentResponse,
  RunContextItem,
  RunContextResponse,
  RunDiagnosticsResponse
} from '@opencreator/protocol';
import { AlertTriangle, Download, Image, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { downloadRunDiagnosticsBundle } from './run-diagnostics-export.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';

function stringifyDiagnosticValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return '[Unserializable value]';
  }
}

export function RunDetailPanel(props: {
  runId?: string;
  diagnostics?: RunDiagnosticsResponse;
  attachments?: AttachmentResponse[];
  context?: RunContextResponse;
  onExport?(diagnostics: RunDiagnosticsResponse): void | Promise<void>;
}) {
  const l = useLocalizedCopy();
  const [confirmingExport, setConfirmingExport] = useState(false);
  const pageIssues = usePageIssueState('run-detail');

  if (props.runId === undefined) {
    return (
      <div className="panel-scroll">
        <p className="empty-state">{l("选择 run 查看详情", "Select a run to view its details")}</p>
      </div>
    );
  }

  if (props.diagnostics === undefined) {
    return (
      <div className="run-detail">
        <div className="settings-state">{l("正在加载运行详情...", "Loading run details...")}</div>
      </div>
    );
  }

  const diagnosticFiles = props.diagnostics?.files ?? [];
  const warnings = props.diagnostics?.warnings ?? [];
  const codexStatusSnapshot = props.diagnostics?.codexStatusSnapshot;
  const codexDiagnostics = codexStatusSnapshot?.diagnostics ?? [];

  async function exportDiagnostics() {
    if (props.diagnostics === undefined) return;
    try {
      await (props.onExport ?? downloadRunDiagnosticsBundle)(props.diagnostics);
      pageIssues.resolveOperation('run-detail.export');
      setConfirmingExport(false);
    } catch (reason) {
      pageIssues.captureOperationFailure('run-detail.export', reason, l("诊断包导出失败，请重试。", "Diagnostic package export failed, please try again."), { retryable: true });
    }
  }

  return (
    <div className="run-detail">
      <div className="run-detail-card">
        <header className="run-detail__header">
          <div>
            <h2>Run {props.runId}</h2>
            <p>{l("诊断文件由 daemon 脱敏后返回。", "The diagnostic file is desensitized and returned by the daemon.")}</p>
          </div>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => setConfirmingExport(true)}
          >
            <Download aria-hidden="true" size={15} />
            <span>{l("导出脱敏诊断包", "Export desensitization diagnostic package")}</span>
          </button>
        </header>
        <IssueList
          issues={pageIssues.issues}
          actions={{ retryOperations: { 'run-detail.export': exportDiagnostics } }}
          onDismiss={pageIssues.dismissIssue}
          compact
        />
        {confirmingExport ? (
          <section className="run-diagnostics-confirm" role="region" aria-label={l("确认导出诊断", "Confirm export diagnostics")}>
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              <strong>{l("确认导出 daemon 已脱敏的诊断内容", "Confirm to export the desensitized diagnostic content of the daemon")}</strong>
              <p>{l("导出包只包含当前诊断响应，不包含原始 Prompt、Token 或 Secret。", "The export package only contains the current diagnostic response, not the original prompt, token, or secret.")}</p>
            </div>
            <div>
              <button className="settings-text-button" type="button" onClick={() => setConfirmingExport(false)}>
                {l("取消", "Cancel")}</button>
              <button className="settings-primary-button" type="button" onClick={() => void exportDiagnostics()}>
                <Download aria-hidden="true" size={15} />
                {l("确认导出", "Confirm export")}</button>
            </div>
          </section>
        ) : null}
        {(props.attachments?.length ?? 0) > 0 ? (
          <section>
            <h3>{l("附件", "appendix")}</h3>
            <ul className="run-detail-attachments">
              {props.attachments?.map(attachment => (
                <li key={attachment.id}>
                  <Image aria-hidden="true" size={15} />
                  <span>
                    <strong>{attachment.fileName}</strong>
                    <small>{attachment.mime} · {formatAttachmentSize(attachment.size)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="run-context">
          <h3>{l("本次使用的上下文", "The context of this use")}</h3>
          {props.context === undefined ? (
            <p>{l("正在加载上下文...", "Loading context...")}</p>
          ) : props.context.items.length === 0 ? (
            <p>{l("本次运行未使用长期记忆或摘要", "No long-term memory or digests were used in this run")}</p>
          ) : (
            <ul>
              {props.context.items.map(item => (
                <RunContextListItem key={`${item.kind}:${item.sourceId}`} item={item} />
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>Diagnostics</h3>
          {diagnosticFiles.length === 0 ? (
            <p>{l("暂无诊断文件", "No diagnostic files yet")}</p>
          ) : (
            diagnosticFiles.map((file) => (
              <details key={file.name}>
                <summary>{file.name}</summary>
                <pre>{file.content}</pre>
              </details>
            ))
          )}
        </section>
        <section>
          <h3>Warnings</h3>
          {warnings.length === 0 ? (
            <p>{l("暂无诊断警告", "No diagnostic warnings yet")}</p>
          ) : (
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>
                  <AlertTriangle aria-hidden="true" size={14} />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {codexStatusSnapshot ? (
          <section>
            <h3>Codex Status</h3>
            <dl>
              <dt>Version</dt>
              <dd>{codexStatusSnapshot.codexVersion}</dd>
              <dt>Binary</dt>
              <dd>{codexStatusSnapshot.codexBin}</dd>
              <dt>Home</dt>
              <dd>{codexStatusSnapshot.codexHome}</dd>
              <dt>Home writable</dt>
              <dd>{String(codexStatusSnapshot.codexHomeWritable)}</dd>
              <dt>Diagnostics</dt>
              <dd>
                {codexDiagnostics.length === 0 ? (
                  '暂无 Codex 诊断'
                ) : (
                  <ul>
                    {codexDiagnostics.map((diagnostic) => (
                      <li key={diagnostic}>{diagnostic}</li>
                    ))}
                  </ul>
                )}
              </dd>
              <dt>Capabilities</dt>
              <dd>
                <pre>{stringifyDiagnosticValue(codexStatusSnapshot.capabilities)}</pre>
              </dd>
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function RunContextListItem(props: { item: RunContextItem }) {
  const l = useLocalizedCopy();
  const label = props.item.kind === 'summary'
    ? l(`会话摘要 v${props.item.summaryVersion ?? 1}`, `Conversation summary v${props.item.summaryVersion ?? 1}`)
    : l(`${memoryScopeLabel(l, props.item.scope)}记忆`, `${memoryScopeLabel(l, props.item.scope)} memory`);
  return (
    <li className="run-context__item">
      <div>
        <strong>{label}</strong>
        {props.item.scopeKey ? <code>{props.item.scopeKey}</code> : null}
      </div>
      <p>{props.item.content}</p>
    </li>
  );
}

function memoryScopeLabel(l: LocalizeCopy, scope: RunContextItem['scope']): string {
  if (scope === 'project') return l("项目", "Projects");
  if (scope === 'thread') return l("线程", "Thread");
  return l("全局", "Global");
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
