import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { IssuePresenter } from './IssuePresenter.js';

const issue = {
  id: 'issue-1',
  diagnosticId: 'OC-12345678',
  code: 'creator_upload_failed',
  scope: { kind: 'page' as const, surface: 'files' },
  source: 'upload' as const,
  category: 'execution' as const,
  severity: 'error' as const,
  status: 'open' as const,
  operation: 'files.upload',
  summaryKey: 'issue.upload_failed',
  summaryParams: {},
  fallbackMessage: '上传未完成，请重试。',
  retryable: true,
  repairActions: [
    { kind: 'retry-operation' as const, operationId: 'files.upload', requiresConfirmation: false, risk: 'normal' as const },
    { kind: 'open-settings' as const, settingsRouteId: 'provider' },
    { kind: 'focus-agent' as const }
  ],
  fingerprint: 'demo',
  occurrenceCount: 1,
  occurredAt: '2026-09-23T00:00:00.000Z',
  lastOccurredAt: '2026-09-23T00:00:00.000Z'
};

describe('IssuePresenter', () => {
  it('hides unregistered actions and executes a registered retry', async () => {
    const retry = vi.fn();
    render(
      <LanguageProvider>
        <IssuePresenter issue={issue} actions={{ retryOperations: { 'files.upload': retry } }} />
      </LanguageProvider>
    );

    expect(screen.getByText('诊断编号：OC-12345678')).toBeInTheDocument();
    expect(screen.queryByText('打开设置')).not.toBeInTheDocument();
    expect(screen.queryByText('询问 Agent')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
