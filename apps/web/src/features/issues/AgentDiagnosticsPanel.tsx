import type { OpenCreatorIssue } from '@opencreator/protocol';
import { MessageSquareText, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import OpenCreatorMark from '../../components/brand/OpenCreatorMark.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { IssueActionButtons, type IssueActionRegistry } from './IssuePresenter.js';
import { issueConversationText, issueDiagnosticText, presentIssue } from './issue-catalog.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { AppLanguage } from '../../i18n/language.js';
import { OriginalErrorDetails } from './OriginalErrorDetails.js';
import { getPageIssueActionsSnapshot, subscribePageIssueActions } from './page-issue-action-hub.js';
import {
  clearPageIssues,
  dismissPageIssue,
  getPageIssues,
  subscribePageIssues
} from './page-issue-hub.js';
import './agent-diagnostics.css';

export default function AgentDiagnosticsPanel(props: {
  hiddenCreatorIssues?: boolean;
  hiddenBackgroundRuntimeIssues?: boolean;
  onAskIssue(issue: OpenCreatorIssue, question: string): void;
}) {
  const { language } = useAppLanguage();
  const localize = useLocalizedCopy();
  const allIssues = useSyncExternalStore(subscribePageIssues, getPageIssues, getPageIssues);
  const actionsByIssueId = useSyncExternalStore(subscribePageIssueActions, getPageIssueActionsSnapshot, getPageIssueActionsSnapshot);
  const issues = useMemo(() => allIssues.filter(issue => (
    !(props.hiddenCreatorIssues && issue.scope.kind === 'page' && issue.scope.surface === 'creator-launch')
    && !(props.hiddenBackgroundRuntimeIssues && isBackgroundRuntimeIssue(issue))
  )), [allIssues, props.hiddenCreatorIssues, props.hiddenBackgroundRuntimeIssues]);
  const [open, setOpen] = useState(false);
  const [focusedIssueId, setFocusedIssueId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const latestIssueRef = useRef<string>();
  const focusedIssue = issues.find(issue => issue.id === focusedIssueId) ?? issues.at(-1) ?? null;

  useEffect(() => {
    const latest = issues.at(-1);
    const key = latest === undefined ? undefined : `${latest.id}:${latest.occurrenceCount}`;
    if (latest !== undefined && key !== latestIssueRef.current
      && !isBackgroundRuntimeIssue(latest)) setOpen(true);
    latestIssueRef.current = key;
  }, [issues]);
  useEffect(() => () => clearPageIssues(), []);

  if (issues.length === 0) return null;

  function send() {
    const question = input.trim();
    if (!question || focusedIssue === null) return;
    props.onAskIssue(focusedIssue, question);
    setInput('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="agent-diagnostics-trigger" type="button" onClick={() => setOpen(true)} aria-label={localize('打开 Agent 诊断', 'Open Agent diagnostics', 'Öppna Agent-diagnostik')}>
        <MessageSquareText size={18} aria-hidden="true" />
        <span>{issues.length}</span>
      </button>
    );
  }

  return (
    <aside className="agent-diagnostics-panel" aria-label={localize('Agent 诊断', 'Agent diagnostics', 'Agent-diagnostik')}>
      <header>
        <span aria-hidden="true"><OpenCreatorMark size={18} /></span>
        <strong>OpenCreator</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label={localize('收起诊断', 'Close diagnostics', 'Stäng diagnostiken')} title={localize('收起诊断', 'Close diagnostics', 'Stäng diagnostiken')}><X size={17} aria-hidden="true" /></button>
      </header>
      <div className="agent-diagnostics-timeline" role="log" aria-label={localize('诊断对话', 'Diagnostic conversation', 'Diagnostiksamtal')} aria-live="polite">
        {issues.map(issue => (
          <DiagnosticMessage
            key={issue.id}
            issue={issue}
            language={language}
            actions={actionsByIssueId.get(issue.id)?.actions}
            focused={focusedIssue?.id === issue.id}
            onFocus={() => setFocusedIssueId(issue.id)}
            onDismiss={() => dismissPageIssue(issue.id)}
          />
        ))}
      </div>
      <form onSubmit={event => { event.preventDefault(); send(); }}>
        <input
          aria-label={localize('询问错误原因或修复办法', 'Ask about this error', 'Fråga om det här felet')}
          value={input}
          onChange={event => setInput(event.target.value)}
          placeholder={localize('询问错误原因或修复办法', 'Ask about this error', 'Fråga om det här felet')}
        />
        <button type="submit" disabled={!input.trim()} aria-label={localize('发送问题', 'Send question', 'Skicka fråga')} title={localize('发送问题', 'Send question', 'Skicka fråga')}><Send size={16} aria-hidden="true" /></button>
      </form>
    </aside>
  );
}

function isBackgroundRuntimeIssue(issue: OpenCreatorIssue): boolean {
  return issue.scope.kind === 'page' && issue.scope.surface === 'runtime'
    && (issue.operation === 'runtime.load-yt-dlp' || issue.operation === 'runtime.auto-check-yt-dlp');
}

function DiagnosticMessage(props: {
  issue: OpenCreatorIssue;
  language: AppLanguage;
  actions?: IssueActionRegistry;
  focused: boolean;
  onFocus(): void;
  onDismiss(): void;
}) {
  const localize = useLocalizedCopy();
  return (
    <article className="agent-diagnostics-message" data-issue-id={props.issue.id} data-focused={props.focused}>
      <div className="agent-diagnostics-message-meta">
        <span>{localize('系统诊断', 'System diagnosis')}</span>
        <button type="button" onClick={props.onDismiss} aria-label={localize('移除这条诊断', 'Dismiss this issue', 'Stäng det här problemet')} title={localize('移除这条诊断', 'Dismiss this issue', 'Stäng det här problemet')}><X size={14} aria-hidden="true" /></button>
      </div>
      <button type="button" className="agent-diagnostics-message-body" onClick={props.onFocus} aria-label={localize('询问这条问题', 'Focus this issue', 'Fråga om det här problemet')}>
        <span>{presentIssue(props.issue, props.language).description}</span>
        <span>{issueConversationText(props.issue, props.language).nextStep}</span>
      </button>
      <OriginalErrorDetails detail={issueDiagnosticText(props.issue, props.language)} />
      <IssueActionButtons issue={props.issue} actions={props.actions} includeFocusAgent={false} />
    </article>
  );
}
