import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import type { AppLanguage } from '../../i18n/language.js';
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
  const l = useLocalizedCopy();
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
      setValidationError(l("保留天数必须是正整数", "The number of retention days must be a positive integer"));
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
        l("无法检查可清理内容，请确认本地服务状态后重试。", "Unable to check cleanable content, please confirm the local service status and try again."),
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
        l("清理未完成，请检查诊断信息后重试。", "The cleanup is not completed, please check the diagnostic information and try again."),
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
          <h1 id="settings-cleanup-title">{l("运行数据清理", "Run data cleanup")}</h1>
          <p>{l("先检查候选内容，再确认删除旧 Run 日志和已归档托管工作区。", "Check candidates before confirming deletion of old run logs and archived managed workspaces.")}</p>
        </div>
      </header>

      {!props.connected ? (
        <p className="settings-notice">{l("本地服务未连接，无法检查可清理内容。", "The local service is not connected and cannot check for cleanable content.")}</p>
      ) : null}
      {props.connected && props.service === null ? (
        <p className="settings-notice">{l("清理服务当前不可用。", "The cleanup service is currently unavailable.")}</p>
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

      <section className="cleanup-controls" aria-label={l("清理范围", "Cleanup scope")}>
        <label>
          <span>{l("保留最近", "keep recent")}</span>
          <span className="cleanup-retention-input">
            <input
              type="number"
              min="1"
              step="1"
              aria-label={l("保留天数", "retention days")}
              value={olderThanDays}
              disabled={!available || phase !== 'idle'}
              onChange={(event) => setOlderThanDays(Number(event.target.value))}
            />
            <span>{l("天", "days")}</span>
          </span>
        </label>
        <button
          className="settings-primary-button"
          type="button"
          disabled={!available || phase !== 'idle'}
          onClick={() => void loadPreview()}
        >
          <RefreshCw className={phase === 'previewing' ? 'settings-spin' : undefined} aria-hidden="true" size={15} />
          {phase === 'previewing' ? l("正在检查", "Checking") : l("检查可清理内容", "Check what can be cleaned")}
        </button>
      </section>

      <section className="cleanup-rules" aria-labelledby="cleanup-rules-title">
        <h2 id="cleanup-rules-title">{l("保留规则", "retention rules")}</h2>
        <ul>
          <li>{l("运行中、排队中和正在取消的任务不会被清理。", "Running, queued, and canceling tasks will be preserved.")}</li>
          <li>{l("只清理已归档的托管工作区，活动工作区和外部目录保持不变。", "Only archived managed workspaces are cleaned, active workspaces and external directories remain unchanged.")}</li>
          <li>{l("数据库中的 Run 和会话记录会保留，用于继续查看状态。", "Run and session records in the database are retained for continued status review.")}</li>
        </ul>
      </section>

      {preview ? (
        <section className="cleanup-preview" aria-labelledby="cleanup-preview-title">
          <div className="cleanup-summary">
            <div>
              <h2 id="cleanup-preview-title">{l("清理预览", "Cleanup preview")}</h2>
              <p>{l(`${candidateCount} 项 · ${formatBytes(preview.totalSizeBytes)}`, `${candidateCount} items · ${formatBytes(preview.totalSizeBytes)}`)}</p>
            </div>
            {candidateCount > 0 && result === undefined ? (
              <button
                className="settings-secondary-button cleanup-delete-button"
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => setConfirming(true)}
              >
                <Trash2 aria-hidden="true" size={15} />
                {l(`删除 ${candidateCount} 项`, `Delete ${candidateCount} items`)}</button>
            ) : null}
          </div>

          {preview.items.length === 0 ? (
            <div className="settings-state">{l("没有符合条件的可清理内容", "There is no eligible content to clean")}</div>
          ) : (
            <ul className="cleanup-item-list" aria-label={l("清理候选列表", "Clean up candidate list")}>
              {preview.items.map(item => <CleanupItem key={`${item.type}:${item.id}`} item={item} />)}
            </ul>
          )}

          <WarningList warnings={preview.warnings} />
        </section>
      ) : null}

      {confirming && preview ? (
        <section className="settings-confirmation" role="region" aria-label={l("确认清理", "Confirm cleanup")}>
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>{l(`确认永久删除 ${candidateCount} 项？`, `Are you sure you want to permanently delete ${candidateCount} items?`)}</strong>
            <p>{l("此操作无法撤销。删除时会重新检查候选内容，发生变化的项目可能被跳过。", "This action cannot be undone. Candidate content is rechecked during deletion, and items that have changed may be skipped.")}</p>
          </div>
          <div className="settings-confirmation__actions">
            <button
              className="settings-text-button"
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => setConfirming(false)}
            >
              {l("取消", "Cancel")}</button>
            <button
              className="settings-primary-button"
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => void deleteCandidates()}
            >
              <Trash2 aria-hidden="true" size={15} />
              {phase === 'deleting' ? l("正在删除", "Deleting") : l(`确认删除 ${candidateCount} 项`, `Confirm deletion of ${candidateCount} items`)}
            </button>
          </div>
        </section>
      ) : null}

      {result && preview ? <CleanupResult preview={preview} result={result} /> : null}
    </section>
  );
}

function CleanupItem(props: { item: CleanupPreviewItem }) {
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  return (
    <li>
      <div className="cleanup-item__title">
        <strong>{cleanupTypeLabel(l, props.item.type)}</strong>
        <span>{formatBytes(props.item.sizeBytes)}</span>
      </div>
      <code>{props.item.path}</code>
      <p>{formatDate(props.item.lastModifiedAt, language)} · {props.item.reason}</p>
    </li>
  );
}

function CleanupResult(props: {
  preview: CleanupPreviewResponse;
  result: CleanupDeleteResponse;
}) {
  const l = useLocalizedCopy();
  const skipped = Math.max(
    props.preview.items.length - props.result.deleted.length - props.result.failed.length,
    0
  );

  return (
    <section className="cleanup-result" aria-labelledby="cleanup-result-title">
      <div className="cleanup-result__title">
        <CheckCircle2 aria-hidden="true" size={18} />
        <div>
          <h2 id="cleanup-result-title">{l("清理结果", "Cleanup results")}</h2>
          <p>{l(`已释放 ${formatBytes(props.result.totalDeletedBytes)}`, `${formatBytes(props.result.totalDeletedBytes)} released`)}</p>
        </div>
      </div>
      <div className="cleanup-result__counts">
        <strong>{l(`已删除 ${props.result.deleted.length} 项`, `${props.result.deleted.length} items deleted`)}</strong>
        <strong data-status={props.result.failed.length > 0 ? 'failed' : 'ok'}>
          {l(`删除失败 ${props.result.failed.length} 项`, `Failed to delete ${props.result.failed.length} items`)}</strong>
        <strong>{l(`跳过 ${skipped} 项`, `Skipped ${skipped} items`)}</strong>
      </div>
      {props.result.failed.length > 0 ? (
        <ul className="cleanup-failure-list" aria-label={l("删除失败明细", "Delete failure details")}>
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
  const l = useLocalizedCopy();
  if (props.warnings.length === 0) return null;
  return (
    <ul className="settings-warning-list" aria-label={l("清理告警", "Cleanup warnings")}>
      {props.warnings.map(warning => <li key={warning}>{warning}</li>)}
    </ul>
  );
}

function cleanupTypeLabel(l: LocalizeCopy, type: CleanupPreviewItem['type']): string {
  return type === 'run_logs' ? l("Run 日志", "Run log") : l("已归档托管工作区", "Archived hosted workspace");
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

function formatDate(value: string, language: AppLanguage): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language);
}
