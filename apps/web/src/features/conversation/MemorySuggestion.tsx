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
      setError('Memory content cannot be empty');
      return;
    }
    if (scope !== 'global' && scopeKey === undefined) {
      setError('This scope is unavailable. Select another scope.');
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
        pageIssues.captureOperationFailure('memory-suggestion.save', reason, 'Could not save the memory. Try again.', { retryable: true });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="memory-suggestion" aria-label="Memory suggestion">
      <div className="memory-suggestion__title">
        <Brain aria-hidden="true" size={16} />
        <strong>Save as a long-term memory?</strong>
      </div>
      <textarea
        aria-label="Suggested memory content"
        maxLength={2000}
        value={content}
        disabled={saving}
        onChange={event => setContent(event.target.value)}
      />
      <div className="memory-suggestion__actions">
        <label>
          <span>Scope</span>
          <select
            aria-label="Suggested memory scope"
            value={scope}
            disabled={saving}
            onChange={event => setScope(event.target.value as MemoryScope)}
          >
            {props.threadKey !== undefined ? <option value="thread">Current thread</option> : null}
            {props.projectKey !== undefined ? <option value="project">Current project</option> : null}
            <option value="global">Global</option>
          </select>
        </label>
        <button type="button" disabled={saving} aria-label="Dismiss memory suggestion" onClick={props.onDismiss}>
          <X aria-hidden="true" size={15} />
          Dismiss
        </button>
        <button
          className="memory-suggestion__save"
          type="button"
          disabled={saving}
          aria-label="Save memory suggestion"
          onClick={() => void save()}
        >
          <Check aria-hidden="true" size={15} />
          {saving ? 'Saving' : 'Save memory'}
        </button>
      </div>
      {confirmingSensitive ? (
        <div className="memory-suggestion__warning" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>This content may contain sensitive information. Confirm before saving it locally.</span>
          <button type="button" onClick={() => void save(true)} aria-label="Confirm saving the sensitive suggestion">
            Confirm save
          </button>
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
