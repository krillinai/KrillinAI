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
  const [confirmingExport, setConfirmingExport] = useState(false);
  const pageIssues = usePageIssueState('run-detail');

  if (props.runId === undefined) {
    return (
      <div className="panel-scroll">
        <p className="empty-state">Select a run to view details</p>
      </div>
    );
  }

  if (props.diagnostics === undefined) {
    return (
      <div className="run-detail">
        <div className="settings-state">Loading run details...</div>
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
      pageIssues.captureOperationFailure('run-detail.export', reason, 'Could not export the diagnostics package. Try again.', { retryable: true });
    }
  }

  return (
    <div className="run-detail">
      <div className="run-detail-card">
        <header className="run-detail__header">
          <div>
            <h2>Run {props.runId}</h2>
            <p>Diagnostic files are redacted by the Daemon.</p>
          </div>
          <button
            className="toolbar-button"
            type="button"
            onClick={() => setConfirmingExport(true)}
          >
            <Download aria-hidden="true" size={15} />
            <span>Export redacted diagnostics</span>
          </button>
        </header>
        <IssueList
          issues={pageIssues.issues}
          actions={{ retryOperations: { 'run-detail.export': exportDiagnostics } }}
          onDismiss={pageIssues.dismissIssue}
          compact
        />
        {confirmingExport ? (
          <section className="run-diagnostics-confirm" role="region" aria-label="Confirm diagnostics export">
            <ShieldCheck aria-hidden="true" size={18} />
            <div>
              <strong>Confirm exporting redacted Daemon diagnostics</strong>
              <p>The export contains only the current diagnostic response, without original prompts, tokens, or secrets.</p>
            </div>
            <div>
              <button className="settings-text-button" type="button" onClick={() => setConfirmingExport(false)}>
                Cancel
              </button>
              <button className="settings-primary-button" type="button" onClick={() => void exportDiagnostics()}>
                <Download aria-hidden="true" size={15} />
                Confirm export
              </button>
            </div>
          </section>
        ) : null}
        {(props.attachments?.length ?? 0) > 0 ? (
          <section>
            <h3>Attachments</h3>
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
          <h3>Context used in this run</h3>
          {props.context === undefined ? (
            <p>Loading context...</p>
          ) : props.context.items.length === 0 ? (
            <p>This run used no long-term memories or summaries</p>
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
            <p>No diagnostic files</p>
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
            <p>No diagnostic warnings</p>
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
                  'No Codex diagnostics'
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
  const label = props.item.kind === 'summary'
    ? `Conversation summary v${props.item.summaryVersion ?? 1}`
    : `${memoryScopeLabel(props.item.scope)} memory`;
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

function memoryScopeLabel(scope: RunContextItem['scope']): string {
  if (scope === 'project') return 'Project';
  if (scope === 'thread') return 'Thread';
  return 'Global';
}

function formatAttachmentSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
