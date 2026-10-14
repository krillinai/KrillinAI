import type {
  CleanupDeleteRequest,
  CleanupDeleteResponse,
  CleanupPreviewItem,
  CleanupPreviewResponse
} from '@opencreator/protocol';
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';

export type CleanupSettingsService = {
  previewCleanup(olderThanDays: number): Promise<CleanupPreviewResponse>;
  deleteCleanup(input: CleanupDeleteRequest): Promise<CleanupDeleteResponse>;
};

export type CleanupSettingsViewProps = {
  connected: boolean;
  service: CleanupSettingsService | null;
};

type CleanupPhase = 'idle' | 'previewing' | 'deleting';

export function CleanupSettingsView(props: CleanupSettingsViewProps) {
  const [olderThanDays, setOlderThanDays] = useState(30);
  const [preview, setPreview] = useState<CleanupPreviewResponse>();
  const [result, setResult] = useState<CleanupDeleteResponse>();
  const [phase, setPhase] = useState<CleanupPhase>('idle');
  const [confirming, setConfirming] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const pageIssues = usePageIssueState('settings-cleanup');

  const available = props.connected && props.service !== null;
  const candidateCount = preview?.items.length ?? 0;

  async function loadPreview() {
    if (!available || phase !== 'idle') return;
    if (!Number.isInteger(olderThanDays) || olderThanDays <= 0) {
      setValidationError('Retention days must be a positive integer');
      return;
    }

    setPhase('previewing');
    setValidationError(undefined);
    setResult(undefined);
    setConfirming(false);
    try {
      setPreview(await props.service!.previewCleanup(olderThanDays));
      pageIssues.resolveOperation('settings.cleanup.preview');
    } catch (reason) {
      setPreview(undefined);
      pageIssues.captureOperationFailure(
        'settings.cleanup.preview',
        reason,
        'Could not inspect cleanup candidates. Check the local Runtime and try again.',
        { retryable: true }
      );
    } finally {
      setPhase('idle');
    }
  }

  async function deleteCandidates() {
    if (!available || preview === undefined || phase !== 'idle') return;
    setPhase('deleting');
    try {
      setResult(await props.service!.deleteCleanup({
        olderThanDays: preview.olderThanDays,
        confirm: true
      }));
      pageIssues.resolveOperation('settings.cleanup.delete');
      setConfirming(false);
    } catch (reason) {
      pageIssues.captureOperationFailure(
        'settings.cleanup.delete',
        reason,
        'Cleanup did not complete. Check diagnostics and try again.',
        { retryable: true, risk: 'overwrite' }
      );
    } finally {
      setPhase('idle');
    }
  }

  return (
    <section className="settings-section settings-management cleanup-settings" aria-labelledby="settings-cleanup-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-cleanup-title">Runtime data cleanup</h1>
          <p>Review candidates before deleting old run logs and archived managed workspaces.</p>
        </div>
      </header>

      {!props.connected ? (
        <p className="settings-notice">The local Runtime is disconnected. Cleanup candidates cannot be checked.</p>
      ) : null}
      {props.connected && props.service === null ? (
        <p className="settings-notice">The cleanup service is unavailable.</p>
      ) : null}
      {validationError ? <p className="settings-error" role="alert">{validationError}</p> : null}
      <IssueList
        issues={pageIssues.issues}
        actions={{ retryOperations: {
          'settings.cleanup.preview': loadPreview,
          'settings.cleanup.delete': deleteCandidates
        } }}
        onDismiss={pageIssues.dismissIssue}
      />

      <section className="cleanup-controls" aria-label="Cleanup scope">
        <label>
          <span>Keep the last</span>
          <span className="cleanup-retention-input">
            <input
              type="number"
              min="1"
              step="1"
              aria-label="Retention days"
              value={olderThanDays}
              disabled={!available || phase !== 'idle'}
              onChange={(event) => setOlderThanDays(Number(event.target.value))}
            />
            <span>days</span>
          </span>
        </label>
        <button
          className="settings-primary-button"
          type="button"
          disabled={!available || phase !== 'idle'}
          onClick={() => void loadPreview()}
        >
          <RefreshCw className={phase === 'previewing' ? 'settings-spin' : undefined} aria-hidden="true" size={15} />
          {phase === 'previewing' ? 'Checking' : 'Check cleanup candidates'}
        </button>
      </section>

      <section className="cleanup-rules" aria-labelledby="cleanup-rules-title">
        <h2 id="cleanup-rules-title">Retention rules</h2>
        <ul>
          <li>Active, queued, and canceling tasks are retained.</li>
          <li>Only archived managed workspaces are cleaned up. Active workspaces and external directories are retained.</li>
          <li>Run and conversation records stay in the database for status review.</li>
        </ul>
      </section>

      {preview ? (
        <section className="cleanup-preview" aria-labelledby="cleanup-preview-title">
          <div className="cleanup-summary">
            <div>
              <h2 id="cleanup-preview-title">Cleanup preview</h2>
              <p>{candidateCount} items | {formatBytes(preview.totalSizeBytes)}</p>
            </div>
            {candidateCount > 0 && result === undefined ? (
              <button
                className="settings-secondary-button cleanup-delete-button"
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => setConfirming(true)}
              >
                <Trash2 aria-hidden="true" size={15} />
                Remove {candidateCount} items
              </button>
            ) : null}
          </div>

          {preview.items.length === 0 ? (
            <div className="settings-state">No eligible cleanup candidates</div>
          ) : (
            <ul className="cleanup-item-list" aria-label="Cleanup candidates">
              {preview.items.map(item => <CleanupItem key={`${item.type}:${item.id}`} item={item} />)}
            </ul>
          )}

          <WarningList warnings={preview.warnings} />
        </section>
      ) : null}

      {confirming && preview ? (
        <section className="settings-confirmation" role="region" aria-label="Confirm cleanup">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>Permanently delete {candidateCount} items?</strong>
            <p>This cannot be undone. Candidates are checked again before deletion; changed items may be skipped.</p>
          </div>
          <div className="settings-confirmation__actions">
            <button
              className="settings-text-button"
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button
              className="settings-primary-button"
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => void deleteCandidates()}
            >
              <Trash2 aria-hidden="true" size={15} />
              {phase === 'deleting' ? 'Deleting' : `Confirm deleting ${candidateCount} items`}
            </button>
          </div>
        </section>
      ) : null}

      {result && preview ? <CleanupResult preview={preview} result={result} /> : null}
    </section>
  );
}

function CleanupItem(props: { item: CleanupPreviewItem }) {
  return (
    <li>
      <div className="cleanup-item__title">
        <strong>{cleanupTypeLabel(props.item.type)}</strong>
        <span>{formatBytes(props.item.sizeBytes)}</span>
      </div>
      <code>{props.item.path}</code>
      <p>{formatDate(props.item.lastModifiedAt)} · {props.item.reason}</p>
    </li>
  );
}

function CleanupResult(props: {
  preview: CleanupPreviewResponse;
  result: CleanupDeleteResponse;
}) {
  const skipped = Math.max(
    props.preview.items.length - props.result.deleted.length - props.result.failed.length,
    0
  );

  return (
    <section className="cleanup-result" aria-labelledby="cleanup-result-title">
      <div className="cleanup-result__title">
        <CheckCircle2 aria-hidden="true" size={18} />
        <div>
          <h2 id="cleanup-result-title">Cleanup results</h2>
          <p>Freed {formatBytes(props.result.totalDeletedBytes)}</p>
        </div>
      </div>
      <div className="cleanup-result__counts">
        <strong>Deleted {props.result.deleted.length} items</strong>
        <strong data-status={props.result.failed.length > 0 ? 'failed' : 'ok'}>
          Deletion failed {props.result.failed.length} items
        </strong>
        <strong>Skipped {skipped} items</strong>
      </div>
      {props.result.failed.length > 0 ? (
        <ul className="cleanup-failure-list" aria-label="Deletion failures">
          {props.result.failed.map(item => (
            <li key={`${item.type}:${item.id}`}>
              <code>{item.path}</code>
              <span>{item.error}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <WarningList warnings={props.result.warnings} />
    </section>
  );
}

function WarningList(props: { warnings: string[] }) {
  if (props.warnings.length === 0) return null;
  return (
    <ul className="settings-warning-list" aria-label="Cleanup warnings">
      {props.warnings.map(warning => <li key={warning}>{warning}</li>)}
    </ul>
  );
}

function cleanupTypeLabel(type: CleanupPreviewItem['type']): string {
  return type === 'run_logs' ? 'Run logs' : 'Archived managed workspace';
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${formatNumber(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${formatNumber(value / (1024 * 1024))} MB`;
  return `${formatNumber(value / (1024 * 1024 * 1024))} GB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
