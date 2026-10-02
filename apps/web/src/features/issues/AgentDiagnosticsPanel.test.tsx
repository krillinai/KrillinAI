import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { ApiClientError } from '../../runtime/client.js';
import AgentDiagnosticsPanel from './AgentDiagnosticsPanel.js';
import { IssueList, PageIssueRoutingProvider } from './IssuePresenter.js';
import { clearPageIssues, publishPageIssue } from './page-issue-hub.js';
import { normalizePageIssue, usePageIssueState } from './page-issue-state.js';
import { LanguageSwitchControls } from '../../test/LanguageSwitchControls.js';

afterEach(() => act(() => clearPageIssues()));

function Harness(props: {
  onAskIssue: Parameters<typeof AgentDiagnosticsPanel>[0]['onAskIssue'];
  onRetry(): void;
}) {
  const state = usePageIssueState('projects');
  return (
    <PageIssueRoutingProvider>
      <button type="button" onClick={() => state.captureOperationFailure('projects.create', new Error('raw detail'), '项目创建失败。', { retryable: true })}>创建项目</button>
      <button type="button" onClick={() => state.captureOperationFailure('projects.archive', new Error('raw detail'), '项目归档失败。')}>归档项目</button>
      <IssueList issues={state.issues} actions={{ retryOperations: { 'projects.create': props.onRetry } }} />
      <AgentDiagnosticsPanel onAskIssue={props.onAskIssue} />
    </PageIssueRoutingProvider>
  );
}

describe('AgentDiagnosticsPanel', () => {
  it('updates diagnosis guidance and preserves the typed question across language changes', () => {
    const raw = '后台原文：本地 Whisper 下载失败';
    act(() => publishPageIssue({ ...normalizePageIssue('runtime', 'creator.prepare', new Error(raw), raw), code: 'creator_dependency_prepare_failed' }));
    const onAskIssue = vi.fn();
    render(<LanguageProvider initialPreference="en-US"><LanguageSwitchControls /><AgentDiagnosticsPanel onAskIssue={onAskIssue} /></LanguageProvider>);
    expect(screen.getByText(/Local transcription preparation failed/)).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Ask about this error' }), { target: { value: '我的问题不应该被翻译' } });
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByRole('complementary', { name: 'Agent-diagnostik' })).toBeVisible();
    expect(screen.getByText(/Förberedelsen av lokal transkription misslyckades/)).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Fråga om det här felet' })).toHaveValue('我的问题不应该被翻译');
    expect(screen.getByText(raw)).not.toBeVisible();
    expect(onAskIssue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Skicka fråga' }));
    expect(onAskIssue).toHaveBeenCalledWith(expect.objectContaining({ code: 'creator_dependency_prepare_failed' }), '我的问题不应该被翻译');
  });
  it('keeps background runtime failures accessible without blocking Creator workflows', () => {
    const onAskIssue = vi.fn();
    const { rerender } = render(<LanguageProvider initialPreference="zh-CN"><AgentDiagnosticsPanel hiddenBackgroundRuntimeIssues onAskIssue={onAskIssue} /></LanguageProvider>);
    act(() => {
      publishPageIssue(normalizePageIssue(
        'runtime',
        'runtime.load-yt-dlp',
        new ApiClientError({ status: 503, code: 'creator_yt_dlp_update_unavailable', message: 'yt-dlp updates are unavailable' }),
        '无法读取运行组件。'
      ));
      publishPageIssue(normalizePageIssue(
        'runtime',
        'runtime.auto-check-yt-dlp',
        new ApiClientError({ status: 502, code: 'creator_yt_dlp_update_check_failed', message: 'yt-dlp update check failed' }),
        '自动检查运行组件失败。'
      ));
    });

    expect(screen.queryByRole('complementary', { name: 'Agent 诊断' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开 Agent 诊断' })).not.toBeInTheDocument();
    rerender(<LanguageProvider initialPreference="zh-CN"><AgentDiagnosticsPanel onAskIssue={onAskIssue} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: '打开 Agent 诊断' }));
    expect(screen.getByRole('complementary', { name: 'Agent 诊断' })).toHaveTextContent('creator_yt_dlp_update_unavailable');
    expect(screen.getByRole('complementary', { name: 'Agent 诊断' })).toHaveTextContent('creator_yt_dlp_update_check_failed');
  });

  it('routes page failures into one conversation, deduplicates retries and follows the selected issue', () => {
    const onAskIssue = vi.fn();
    const onRetry = vi.fn();
    const { container } = render(<LanguageProvider initialPreference="zh-CN"><Harness onAskIssue={onAskIssue} onRetry={onRetry} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    fireEvent.click(screen.getByRole('button', { name: '归档项目' }));

    const panel = screen.getByRole('complementary', { name: 'Agent 诊断' });
    expect(within(panel).getAllByText(/操作未完成 错误码：CLIENT_OPERATION_FAILED/)).toHaveLength(2);
    expect(within(panel).getByText('项目创建失败。')).not.toBeVisible();
    expect(within(panel).getByText('项目归档失败。')).not.toBeVisible();
    expect(container.querySelectorAll('[data-issue-id]')).toHaveLength(2);
    expect(container.querySelector('.issue-presenter')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/诊断编号：OC-/)).not.toBeInTheDocument();

    const createIssue = screen.getByText('项目创建失败。').closest<HTMLElement>('[data-issue-id]')!;
    fireEvent.click(within(createIssue).getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(within(createIssue).getByRole('button', { name: '询问这条问题' }));
    fireEvent.change(within(panel).getByRole('textbox', { name: '询问错误原因或修复办法' }), {
      target: { value: '这个创建错误怎么修？' }
    });
    fireEvent.click(within(panel).getByRole('button', { name: '发送问题' }));

    expect(onAskIssue).toHaveBeenCalledWith(expect.objectContaining({ operation: 'projects.create' }), '这个创建错误怎么修？');
    expect(screen.getByRole('button', { name: '打开 Agent 诊断' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('已确认：');
  });
});
