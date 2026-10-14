import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
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
  const l = useLocalizedCopy();
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
        l("无法加载记忆，请重试。", "Unable to load memory, please try again."),
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
      setValidationError(l("记忆内容不能为空", "Memory content cannot be empty"));
      return;
    }
    if (editor.scope !== 'global' && editor.scopeKey === undefined) {
      setValidationError(l("请选择范围目标", "Please select a scope target"));
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
          l("保存记忆失败，请检查内容后重试。", "Failed to save memory, please check the content and try again."),
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
      pageIssues.captureOperationFailure(operationId, reason, l("更新记忆状态失败，请重试。", "Failed to update memory status, please try again."));
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
      pageIssues.captureOperationFailure(operationId, reason, l("删除记忆失败，请重试。", "Failed to delete memory, please try again."));
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
      pageIssues.captureOperationFailure('settings.memory.disable-all', reason, l("全部停用失败，请重试。", "Deactivation of all failed, please try again."));
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
      pageIssues.captureOperationFailure(operationId, reason, l("删除摘要失败，请重试。", "Failed to delete summary, please try again."));
    }
  }

  return (
    <section className="settings-section settings-management memory-settings" aria-labelledby="settings-memory-title">
      <header className="settings-management__header">
        <div>
          <h1 id="settings-memory-title">{l("记忆", "Memory")}</h1>
          <p>{l("只保存你明确确认的长期偏好，并记录每次 Run 实际使用的上下文快照。", "Only save long-term preferences that you explicitly acknowledge, and record a snapshot of the context actually used by each run.")}</p>
        </div>
        <button className="settings-primary-button" type="button" disabled={!available} onClick={openCreate}>
          <Plus aria-hidden="true" size={15} />
          {l("新建记忆", "Create new memory")}</button>
      </header>

      {!props.connected ? <p className="settings-notice">{l("本地服务未连接，无法管理记忆。", "The local service is not connected and cannot manage memory.")}</p> : null}
      {props.connected && props.service === null ? <p className="settings-notice">{l("记忆服务当前不可用。", "The memory service is currently unavailable.")}</p> : null}
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
            aria-label={l("搜索记忆", "Search memory")}
            placeholder={l("搜索记忆", "Search memory")}
            value={query}
            disabled={!available}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>{l("范围", "Scope")}</span>
          <select
            aria-label={l("筛选记忆范围", "Filter memory range")}
            value={scope}
            disabled={!available}
            onChange={event => setScope(event.target.value as MemoryScope | 'all')}
          >
            <option value="all">{l("全部范围", "full scope")}</option>
            <option value="global">{l("全局", "Global")}</option>
            <option value="project">{l("项目", "Projects")}</option>
            <option value="thread">{l("线程", "Thread")}</option>
          </select>
        </label>
        <label>
          <span>{l("状态", "Status")}</span>
          <select
            aria-label={l("筛选记忆状态", "Filter memory status")}
            value={String(enabled)}
            disabled={!available}
            onChange={event => setEnabled(
              event.target.value === 'all' ? 'all' : event.target.value === 'true'
            )}
          >
            <option value="all">{l("全部状态", "All status")}</option>
            <option value="true">{l("已启用", "Enabled")}</option>
            <option value="false">{l("已停用", "Disabled")}</option>
          </select>
        </label>
        <button
          className="settings-secondary-button"
          type="button"
          disabled={!available || memories.length === 0}
          onClick={() => setConfirmingDisableAll(true)}
        >
          <PowerOff aria-hidden="true" size={15} />
          {l("全部停用", "Disable all")}</button>
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
        <section className="settings-confirmation" role="region" aria-label={l("确认全部停用记忆", "Confirm to disable all memories")}>
          <AlertTriangle aria-hidden="true" size={18} />
          <div>
            <strong>{l("确认停用全部长期记忆？", "Are you sure to disable all long-term memory?")}</strong>
            <p>{l("记录不会删除，但后续 Run 不再注入这些记忆。", "The records will not be deleted, but subsequent runs will no longer inject these memories.")}</p>
          </div>
          <div className="settings-confirmation__actions">
            <button className="settings-text-button" type="button" onClick={() => setConfirmingDisableAll(false)}>
              {l("取消", "Cancel")}</button>
            <button className="settings-primary-button" type="button" onClick={() => void disableAll()}>
              {l("确认全部停用", "Confirm to deactivate all")}</button>
          </div>
        </section>
      ) : null}

      <section className="memory-block" aria-labelledby="memory-list-title">
        <div className="memory-block__header">
          <div>
            <h2 id="memory-list-title">{l("长期记忆", "long term memory")}</h2>
            <p>{l(`${memories.length} 条`, `${memories.length} items`)}</p>
          </div>
        </div>
        {loading ? (
          <div className="settings-state">{l("正在加载记忆...", "Loading memory...")}</div>
        ) : memories.length === 0 ? (
          <div className="settings-state">{l("没有符合条件的记忆", "No matching memory")}</div>
        ) : (
          <ul className="memory-list">
            {memories.map(memory => (
              <li key={memory.id}>
                <div className="memory-item__main">
                  <div className="memory-item__meta">
                    <span>{memoryScopeLabel(l, memory.scope)}</span>
                    <span data-status={memory.enabled ? 'enabled' : 'disabled'}>
                      {memory.enabled ? l("已启用", "Enabled") : l("已停用", "Disabled")}
                    </span>
                    {memory.sensitive ? <span data-status="sensitive">{l("敏感", "sensitive")}</span> : null}
                    <span>{memory.source === 'user' ? l("用户保存", "User save") : l("Agent 建议", "Agent suggestion")}</span>
                  </div>
                  <p>{memory.content}</p>
                  {memory.scopeKey ? <code>{scopeKeyLabel(memory, props.projects, props.threads)}</code> : null}
                </div>
                <div className="memory-item__actions">
                  <button type="button" aria-label={l("编辑记忆", "Edit memory")} title={l("编辑记忆", "Edit memory")} onClick={() => openEdit(memory)}>
                    <Pencil aria-hidden="true" size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={memory.enabled ? l("停用记忆", "Disable memory") : l("启用记忆", "Enable memory")}
                    title={memory.enabled ? l("停用记忆", "Disable memory") : l("启用记忆", "Enable memory")}
                    onClick={() => void toggleMemory(memory)}
                  >
                    {memory.enabled
                      ? <PowerOff aria-hidden="true" size={15} />
                      : <Power aria-hidden="true" size={15} />}
                  </button>
                  <button type="button" aria-label={l("删除记忆", "Delete memory")} title={l("删除记忆", "Delete memory")} onClick={() => void deleteMemory(memory.id)}>
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
            <h2 id="summary-list-title">{l("会话摘要", "Session summary")}</h2>
            <p>{l(`${summaries.length} 个版本`, `${summaries.length} versions`)}</p>
          </div>
        </div>
        {summaries.length === 0 ? (
          <div className="settings-state">{l("尚未生成会话摘要", "Session summary has not been generated yet")}</div>
        ) : (
          <ul className="summary-list">
            {summaries.map(summary => (
              <li key={summary.id}>
                <header>
                  <div>
                    <strong>{optionLabel(summary.threadId, props.threads)}</strong>
                    <span>{l(`版本 ${summary.version}`, `Version ${summary.version}`)}</span>
                  </div>
                  <button type="button" aria-label={l("删除摘要", "Delete summary")} title={l("删除摘要", "Delete summary")} onClick={() => void deleteSummary(summary.id)}>
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </header>
                <p>{summary.content}</p>
                <small>
                  {l(`${summary.itemCount} 项 · ${summary.coveredFromCursor} 至 ${summary.coveredToCursor}`, `${summary.itemCount} items · ${summary.coveredFromCursor} to ${summary.coveredToCursor}`)}</small>
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
  const l = useLocalizedCopy();
  const options = props.editor.scope === 'project'
    ? props.projects
    : props.editor.scope === 'thread'
      ? props.threads
      : [];
  return (
    <section className="settings-editor memory-editor" aria-label={props.editor.mode === 'create' ? l("新建记忆", "Create new memory") : l("编辑记忆", "Edit memory")}>
      <header>
        <div>
          <h2>{props.editor.mode === 'create' ? l("新建记忆", "Create new memory") : l("编辑记忆", "Edit memory")}</h2>
          <p>{l("单条最多 2000 字符，只存储在本机 Runtime 数据库。", "A single entry can have a maximum length of 2000 characters and is only stored in the local runtime database.")}</p>
        </div>
        <button type="button" aria-label={l("关闭记忆编辑器", "Close memory editor")} onClick={props.onClose}>
          <X aria-hidden="true" size={15} />
        </button>
      </header>
      <div className="settings-form-grid">
        <label className="settings-form-wide">
          <span>{l("记忆内容", "memory content")}</span>
          <textarea
            aria-label={l("记忆内容", "memory content")}
            rows={4}
            maxLength={2000}
            value={props.editor.content}
            disabled={props.saving}
            onChange={event => props.onChange({ ...props.editor, content: event.target.value })}
          />
        </label>
        <label>
          <span>{l("范围", "Scope")}</span>
          <select
            aria-label={l("记忆范围", "Memory scope")}
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
            <option value="global">{l("全局", "Global")}</option>
            <option value="project">{l("项目", "Projects")}</option>
            <option value="thread">{l("线程", "Thread")}</option>
          </select>
        </label>
        {props.editor.scope !== 'global' ? (
          <label>
            <span>{l("目标", "Target")}</span>
            <select
              aria-label={l("范围目标", "scope target")}
              value={props.editor.scopeKey ?? ''}
              disabled={props.saving || props.editor.mode === 'edit'}
              onChange={event => props.onChange({ ...props.editor, scopeKey: event.target.value })}
            >
              {options.length === 0 ? <option value="">{l("无可用目标", "No target available")}</option> : null}
              {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {props.confirmingSensitive ? (
        <div className="settings-inline-warning memory-sensitive-warning" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          <span>{l("内容可能包含敏感信息，确认后才会保存到本机。", "The content may contain sensitive information and will be saved to this machine only after confirmation.")}</span>
          <button type="button" onClick={() => void props.onSave(true)} aria-label={l("确认保存敏感记忆", "Confirm to save sensitive memories")}>
            {l("确认保存", "Confirm to save")}</button>
        </div>
      ) : null}
      <footer>
        <button className="settings-text-button" type="button" onClick={props.onClose}>{l("取消", "Cancel")}</button>
        <button className="settings-primary-button" type="button" disabled={props.saving} onClick={() => void props.onSave()}>
          <Brain aria-hidden="true" size={15} />
          {props.saving ? l("正在保存", "Saving") : props.editor.mode === 'create' ? l("保存记忆", "save memory") : l("保存修改", "Save changes")}
        </button>
      </footer>
    </section>
  );
}

function memoryScopeLabel(l: LocalizeCopy, scope: MemoryScope): string {
  if (scope === 'project') return l("项目", "Projects");
  if (scope === 'thread') return l("线程", "Thread");
  return l("全局", "Global");
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
