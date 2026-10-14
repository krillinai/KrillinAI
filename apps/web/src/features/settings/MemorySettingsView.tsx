import type {
  ConversationSummary,
  ConversationSummaryListResponse,
  CreateMemoryRequest,
  MemoryDisableAllResponse,
  MemoryEntry,
  MemoryListQuery,
  MemoryListResponse,
  MemoryResponse,
  MemoryScope,
  UpdateMemoryRequest
} from '@opencreator/protocol';
import {
  AlertTriangle,
  Brain,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiClientError } from '../../runtime/errors.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';

export type MemorySettingsService = {
  listMemories(query?: MemoryListQuery): Promise<MemoryListResponse>;
  createMemory(input: CreateMemoryRequest): Promise<MemoryResponse>;
  updateMemory(id: string, input: UpdateMemoryRequest): Promise<MemoryResponse>;
  deleteMemory(id: string): Promise<{ deleted: true }>;
  disableAll(): Promise<MemoryDisableAllResponse>;
  listSummaries(input?: { threadId?: string; limit?: number }): Promise<ConversationSummaryListResponse>;
  deleteSummary(id: string): Promise<{ deleted: true }>;
};

export type MemoryScopeOption = {
  key: string;
  label: string;
};

type EditorState = {
  mode: 'create' | 'edit';
  memoryId?: string;
  content: string;
  scope: MemoryScope;
  scopeKey?: string;
};

export function MemorySettingsView(props: {
  connected: boolean;
  service: MemorySettingsService | null;
  projects: MemoryScopeOption[];
  threads: MemoryScopeOption[];
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<MemoryScope | 'all'>('all');
  const [enabled, setEnabled] = useState<boolean | 'all'>('all');
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [editor, setEditor] = useState<EditorState>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const [confirmingSensitive, setConfirmingSensitive] = useState(false);
  const [confirmingDisableAll, setConfirmingDisableAll] = useState(false);
  const available = props.connected && props.service !== null;
  const pageIssues = usePageIssueState('settings-memory');

  useEffect(() => {
    let canceled = false;
    if (!available) {
      setMemories([]);
      setSummaries([]);
      return () => {
        canceled = true;
      };
    }
    setLoading(true);
    Promise.all([
      props.service!.listMemories({
        query: query.trim(),
        scope,
        enabled,
        limit: 100
      }),
      props.service!.listSummaries({ limit: 100 })
    ]).then(([memoryResponse, summaryResponse]) => {
      if (canceled) return;
      setMemories(memoryResponse.memories);
      setSummaries(summaryResponse.summaries);
      pageIssues.resolveOperation('settings.memory.load');
    }).catch(reason => {
      if (!canceled) pageIssues.captureOperationFailure(
        'settings.memory.load',
        reason,
        'Could not load memories. Try again.',
        { retryable: true }
      );
    }).finally(() => {
      if (!canceled) setLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [
    available,
    enabled,
    pageIssues.captureOperationFailure,
    pageIssues.resolveOperation,
    props.service,
    query,
    scope
  ]);

  async function refresh() {
    if (!available) return;
    const [memoryResponse, summaryResponse] = await Promise.all([
      props.service!.listMemories({
        query: query.trim(),
        scope,
        enabled,
        limit: 100
      }),
      props.service!.listSummaries({ limit: 100 })
    ]);
    setMemories(memoryResponse.memories);
    setSummaries(summaryResponse.summaries);
    pageIssues.resolveOperation('settings.memory.load');
  }

  function openCreate() {
    setEditor({
      mode: 'create',
      content: '',
      scope: 'global'
    });
    setConfirmingSensitive(false);
    setValidationError(undefined);
  }

  function openEdit(memory: MemoryEntry) {
    setEditor({
      mode: 'edit',
      memoryId: memory.id,
      content: memory.content,
      scope: memory.scope,
      scopeKey: memory.scopeKey
    });
    setConfirmingSensitive(false);
    setValidationError(undefined);
  }

  async function saveEditor(acknowledgeSensitive = false) {
    if (!available || editor === undefined) return;
    const content = editor.content.trim();
    if (content.length === 0) {
      setValidationError('Memory content cannot be empty');
      return;
    }
    if (editor.scope !== 'global' && editor.scopeKey === undefined) {
      setValidationError('Select a scope target');
      return;
    }
    setSaving(true);
    setValidationError(undefined);
    try {
      if (editor.mode === 'create') {
        await props.service!.createMemory({
          content,
          scope: editor.scope,
          ...(editor.scopeKey === undefined ? {} : { scopeKey: editor.scopeKey }),
          source: 'user',
          ...(acknowledgeSensitive ? { acknowledgeSensitive: true } : {})
        });
      } else {
        await props.service!.updateMemory(editor.memoryId!, {
          content,
          ...(acknowledgeSensitive ? { acknowledgeSensitive: true } : {})
        });
      }
      setEditor(undefined);
      setConfirmingSensitive(false);
      await refresh();
      pageIssues.resolveOperation('settings.memory.save');
    } catch (reason) {
      if (
        reason instanceof ApiClientError
        && reason.code === 'MEMORY_SENSITIVE_CONFIRMATION_REQUIRED'
      ) {
        setConfirmingSensitive(true);
      } else {
        pageIssues.captureOperationFailure(
          'settings.memory.save',
          reason,
          'Could not save the memory. Check its content and try again.',
          { retryable: true }
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleMemory(memory: MemoryEntry) {
    if (!available) return;
    const operationId = `settings.memory.toggle:${memory.id}`;
    try {
      await props.service!.updateMemory(memory.id, { enabled: !memory.enabled });
      await refresh();
      pageIssues.resolveOperation(operationId);
    } catch (reason) {
      pageIssues.captureOperationFailure(operationId, reason, 'Could not update memory status. Try again.');
    }
  }

  async function deleteMemory(id: string) {
    if (!available) return;
    const operationId = `settings.memory.delete:${id}`;
    try {
      await props.service!.deleteMemory(id);
      await refresh();
      pageIssues.resolveOperation(operationId);
    } catch (reason) {
      pageIssues.captureOperationFailure(operationId, reason, 'Could not delete the memory. Try again.');
    }
  }

  async function disableAll() {
    if (!available) return;
    try {
      await props.service!.disableAll();
      setConfirmingDisableAll(false);
      await refresh();
      pageIssues.resolveOperation('settings.memory.disable-all');
    } catch (reason) {
      pageIssues.captureOperationFailure('settings.memory.disable-all', reason, 'Could not disable all memories. Try again.');
    }
  }

  async function deleteSummary(id: string) {
    if (!available) return;
    const operationId = `settings.memory.delete-summary:${id}`;
    try {
      await props.service!.deleteSummary(id);
      await refresh();
      pageIssues.resolveOperation(operationId);
    } catch (reason) {
      pageIssues.captureOperationFailure(operationId, reason, 'Could not delete the summary. Try again.');
    }
  }

  return (
    <section className="settings-section settings-management memory-settings" aria-labelledby="settings-memory-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-memory-title">Memories</h1>
          <p>Save confirmed long-term preferences and track the context used by each run.</p>
        </div>
        <button className="settings-primary-button" type="button" disabled={!available} onClick={openCreate}>
          <Plus aria-hidden="true" size={15} />
          New memory
        </button>
      </header>

      {!props.connected ? <p className="settings-notice">The local Runtime is disconnected. Memories cannot be managed.</p> : null}
      {props.connected && props.service === null ? <p className="settings-notice">The memory service is unavailable.</p> : null}
      {validationError ? <p className="settings-error" role="alert">{validationError}</p> : null}
      <IssueList
        issues={pageIssues.issues}
        actions={{ retryOperations: {
          'settings.memory.load': refresh,
          'settings.memory.save': saveEditor
        } }}
        onDismiss={pageIssues.dismissIssue}
      />

      <div className="memory-toolbar">
        <label className="memory-search">
          <Search aria-hidden="true" size={15} />
          <input
            type="search"
            aria-label="Search memories"
            placeholder="Search memories"
            value={query}
            disabled={!available}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Scope</span>
          <select
            aria-label="Filter memory scope"
            value={scope}
            disabled={!available}
            onChange={event => setScope(event.target.value as MemoryScope | 'all')}
          >
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="thread">Thread</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            aria-label="Filter memory status"
            value={String(enabled)}
            disabled={!available}
            onChange={event => setEnabled(
              event.target.value === 'all' ? 'all' : event.target.value === 'true'
            )}
          >
            <option value="all">All statuses</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
        </label>
        <button
          className="settings-secondary-button"
          type="button"
          disabled={!available || memories.length === 0}
          onClick={() => setConfirmingDisableAll(true)}
        >
          <PowerOff aria-hidden="true" size={15} />
          Disable all
        </button>
      </div>

      {editor ? (
        <MemoryEditor
          editor={editor}
          projects={props.projects}
          threads={props.threads}
          saving={saving}
          confirmingSensitive={confirmingSensitive}
          onChange={setEditor}
          onClose={() => setEditor(undefined)}
          onSave={saveEditor}
        />
      ) : null}

      {confirmingDisableAll ? (
        <section className="settings-confirmation" role="region" aria-label="Confirm disabling all memories">
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>Disable all long-term memories?</strong>
            <p>Records are retained, but future runs will no longer use these memories.</p>
          </div>
          <div className="settings-confirmation__actions">
            <button className="settings-text-button" type="button" onClick={() => setConfirmingDisableAll(false)}>
              Cancel
            </button>
            <button className="settings-primary-button" type="button" onClick={() => void disableAll()}>
              Confirm disable all
            </button>
          </div>
        </section>
      ) : null}

      <section className="memory-block" aria-labelledby="memory-list-title">
        <div className="memory-block__header">
          <div>
            <h2 id="memory-list-title">Long-term memories</h2>
            <p>{memories.length} entries</p>
          </div>
        </div>
        {loading ? (
          <div className="settings-state">Loading memories...</div>
        ) : memories.length === 0 ? (
          <div className="settings-state">No matching memories</div>
        ) : (
          <ul className="memory-list">
            {memories.map(memory => (
              <li key={memory.id}>
                <div className="memory-item__main">
                  <div className="memory-item__meta">
                    <span>{memoryScopeLabel(memory.scope)}</span>
                    <span data-status={memory.enabled ? 'enabled' : 'disabled'}>
                      {memory.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {memory.sensitive ? <span data-status="sensitive">Sensitive</span> : null}
                    <span>{memory.source === 'user' ? 'Saved by user' : 'Suggested by Agent'}</span>
                  </div>
                  <p>{memory.content}</p>
                  {memory.scopeKey ? <code>{scopeKeyLabel(memory, props.projects, props.threads)}</code> : null}
                </div>
                <div className="memory-item__actions">
                  <button type="button" aria-label="Edit memory" title="Edit memory" onClick={() => openEdit(memory)}>
                    <Pencil aria-hidden="true" size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={memory.enabled ? 'Disable memory' : 'Enable memory'}
                    title={memory.enabled ? 'Disable memory' : 'Enable memory'}
                    onClick={() => void toggleMemory(memory)}
                  >
                    {memory.enabled
                      ? <PowerOff aria-hidden="true" size={15} />
                      : <Power aria-hidden="true" size={15} />}
                  </button>
                  <button type="button" aria-label="Delete memory" title="Delete memory" onClick={() => void deleteMemory(memory.id)}>
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="memory-block" aria-labelledby="summary-list-title">
        <div className="memory-block__header">
          <div>
            <h2 id="summary-list-title">Conversation summaries</h2>
            <p>{summaries.length} versions</p>
          </div>
        </div>
        {summaries.length === 0 ? (
          <div className="settings-state">No conversation summaries yet</div>
        ) : (
          <ul className="summary-list">
            {summaries.map(summary => (
              <li key={summary.id}>
                <header>
                  <div>
                    <strong>{optionLabel(summary.threadId, props.threads)}</strong>
                    <span>Version {summary.version}</span>
                  </div>
                  <button type="button" aria-label="Delete summary" title="Delete summary" onClick={() => void deleteSummary(summary.id)}>
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </header>
                <p>{summary.content}</p>
                <small>
                  {summary.itemCount} items | {summary.coveredFromCursor} to {summary.coveredToCursor}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function MemoryEditor(props: {
  editor: EditorState;
  projects: MemoryScopeOption[];
  threads: MemoryScopeOption[];
  saving: boolean;
  confirmingSensitive: boolean;
  onChange(editor: EditorState): void;
  onClose(): void;
  onSave(acknowledgeSensitive?: boolean): Promise<void>;
}) {
  const options = props.editor.scope === 'project'
    ? props.projects
    : props.editor.scope === 'thread'
      ? props.threads
      : [];
  return (
    <section className="settings-editor memory-editor" aria-label={props.editor.mode === 'create' ? 'New memory' : 'Edit memory'}>
      <header>
        <div>
          <h2>{props.editor.mode === 'create' ? 'New memory' : 'Edit memory'}</h2>
          <p>Up to 2,000 characters per memory, stored only in the local Runtime database.</p>
        </div>
        <button type="button" aria-label="Close memory editor" onClick={props.onClose}>
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      <div className="settings-form-grid">
        <label className="settings-form-wide">
          <span>Memory content</span>
          <textarea
            aria-label="Memory content"
            rows={4}
            maxLength={2000}
            value={props.editor.content}
            disabled={props.saving}
            onChange={event => props.onChange({ ...props.editor, content: event.target.value })}
          />
        </label>
        <label>
          <span>Scope</span>
          <select
            aria-label="Memory scope"
            value={props.editor.scope}
            disabled={props.saving || props.editor.mode === 'edit'}
            onChange={event => {
              const nextScope = event.target.value as MemoryScope;
              props.onChange({
                ...props.editor,
                scope: nextScope,
                scopeKey: nextScope === 'global'
                  ? undefined
                  : (nextScope === 'project' ? props.projects[0]?.key : props.threads[0]?.key)
              });
            }}
          >
            <option value="global">Global</option>
            <option value="project">Project</option>
            <option value="thread">Thread</option>
          </select>
        </label>
        {props.editor.scope !== 'global' ? (
          <label>
            <span>Target</span>
            <select
              aria-label="Scope target"
              value={props.editor.scopeKey ?? ''}
              disabled={props.saving || props.editor.mode === 'edit'}
              onChange={event => props.onChange({ ...props.editor, scopeKey: event.target.value })}
            >
              {options.length === 0 ? <option value="">No targets available</option> : null}
              {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {props.confirmingSensitive ? (
        <div className="settings-inline-warning memory-sensitive-warning" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>This content may contain sensitive information. Confirm before saving it locally.</span>
          <button type="button" onClick={() => void props.onSave(true)} aria-label="Confirm saving sensitive memory">
            Confirm save
          </button>
        </div>
      ) : null}
      <footer>
        <button className="settings-text-button" type="button" onClick={props.onClose}>Cancel</button>
        <button className="settings-primary-button" type="button" disabled={props.saving} onClick={() => void props.onSave()}>
          <Brain aria-hidden="true" size={15} />
          {props.saving ? 'Saving' : props.editor.mode === 'create' ? 'Save memory' : 'Save changes'}
        </button>
      </footer>
    </section>
  );
}

function memoryScopeLabel(scope: MemoryScope): string {
  if (scope === 'project') return 'Project';
  if (scope === 'thread') return 'Thread';
  return 'Global';
}

function optionLabel(key: string, options: MemoryScopeOption[]): string {
  return options.find(option => option.key === key)?.label ?? key;
}

function scopeKeyLabel(
  memory: MemoryEntry,
  projects: MemoryScopeOption[],
  threads: MemoryScopeOption[]
): string {
  if (memory.scopeKey === undefined) return '';
  return optionLabel(memory.scopeKey, memory.scope === 'project' ? projects : threads);
}
