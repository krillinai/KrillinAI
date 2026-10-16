import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreateMemoryRequest, MemoryScope } from '@opencreator/protocol';
import { AlertTriangle, Brain, Check, X } from 'lucide-react';
import { useState } from 'react';
import { ApiClientError } from '../../runtime/errors.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';

export function MemorySuggestion(props: {
  content: string;
  projectKey?: string;
  threadKey?: string;
  onSave(input: CreateMemoryRequest): Promise<void>;
  onDismiss(): void;
}) {
  const l = useLocalizedCopy();
  const [content, setContent] = useState(props.content);
  const [scope, setScope] = useState<MemoryScope>(props.threadKey === undefined ? 'global' : 'thread');
  const [saving, setSaving] = useState(false);
  const [confirmingSensitive, setConfirmingSensitive] = useState(false);
  const [error, setError] = useState<string>();
  const pageIssues = usePageIssueState('memory-suggestion');

  async function save(acknowledgeSensitive = false) {
    const normalized = content.trim();
    const scopeKey = scope === 'thread'
      ? props.threadKey
      : scope === 'project'
        ? props.projectKey
        : undefined;
    if (normalized.length === 0) {
      setError(l("记忆内容不能为空", "Memory content cannot be empty"));
      return;
    }
    if (scope !== 'global' && scopeKey === undefined) {
      setError(l("当前范围不可用，请选择其他范围", "The current range is unavailable, please select another range"));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      await props.onSave({
        content: normalized,
        scope,
        ...(scopeKey === undefined ? {} : { scopeKey }),
        source: 'agent_suggestion',
        ...(acknowledgeSensitive ? { acknowledgeSensitive: true } : {})
      });
      pageIssues.resolveOperation('memory-suggestion.save');
      props.onDismiss();
    } catch (reason) {
      if (
        reason instanceof ApiClientError
        && reason.code === 'MEMORY_SENSITIVE_CONFIRMATION_REQUIRED'
      ) {
        setConfirmingSensitive(true);
      } else {
        pageIssues.captureOperationFailure('memory-suggestion.save', reason, l("保存记忆失败，请重试。", "Failed to save memory, please try again."), { retryable: true });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="memory-suggestion" aria-label={l("记忆建议", "memory suggestions")}>
      <div className="memory-suggestion__title">
        <Brain aria-hidden="true" size={16} />
        <strong>{l("保存为长期记忆？", "Save as long-term memory?")}</strong>
      </div>
      <textarea
        aria-label={l("记忆建议内容", "Memorize suggested content")}
        maxLength={2000}
        value={content}
        disabled={saving}
        onChange={event => setContent(event.target.value)}
      />
      <div className="memory-suggestion__actions">
        <label>
          <span>{l("范围", "Scope")}</span>
          <select
            aria-label={l("记忆建议范围", "Memory suggested range")}
            value={scope}
            disabled={saving}
            onChange={event => setScope(event.target.value as MemoryScope)}
          >
            {props.threadKey !== undefined ? <option value="thread">{l("当前线程", "Current thread")}</option> : null}
            {props.projectKey !== undefined ? <option value="project">{l("当前项目", "Current project")}</option> : null}
            <option value="global">{l("全局", "Global")}</option>
          </select>
        </label>
        <button type="button" disabled={saving} aria-label={l("忽略记忆建议", "Ignore memory suggestions")} onClick={props.onDismiss}>
          <X aria-hidden="true" size={15} />
          {l("忽略", "neglect")}</button>
        <button
          className="memory-suggestion__save"
          type="button"
          disabled={saving}
          aria-label={l("保存记忆建议", "Save memory suggestions")}
          onClick={() => void save()}
        >
          <Check aria-hidden="true" size={15} />
          {saving ? l("正在保存", "Saving") : l("保存记忆", "save memory")}
        </button>
      </div>
      {confirmingSensitive ? (
        <div className="memory-suggestion__warning" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>{l("内容可能包含敏感信息，仅在确认后保存到本机。", "The content may contain sensitive information and will only be saved to this machine after confirmation.")}</span>
          <button type="button" onClick={() => void save(true)} aria-label={l("确认保存敏感建议", "Confirm to save sensitive suggestions")}>
            {l("确认保存", "Confirm to save")}</button>
        </div>
      ) : null}
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <IssueList
        issues={pageIssues.issues}
        actions={{ retryOperations: { 'memory-suggestion.save': () => save() } }}
        onDismiss={pageIssues.dismissIssue}
        compact
      />
    </section>
  );
}
