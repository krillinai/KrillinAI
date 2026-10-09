import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageProvider.js';
import {
  RuntimeConnectionNotice,
  RuntimeConnectionProvider,
  type RuntimeConnectionNoticeState
} from './runtime-connection-context.js';

function renderNotice(value: RuntimeConnectionNoticeState) {
  render(
    <LanguageProvider initialPreference="zh-CN">
      <RuntimeConnectionProvider value={value}>
        <RuntimeConnectionNotice />
      </RuntimeConnectionProvider>
    </LanguageProvider>
  );
}

describe('Runtime connection notice', () => {
  it('shows only the available browser retry action', () => {
    const retry = vi.fn();
    renderNotice({
      status: 'disconnected',
      waitingForConfig: false,
      restarting: false,
      retry
    });

    fireEvent.click(screen.getByRole('button', { name: '重试连接' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '重启本地服务' })).not.toBeInTheDocument();
  });

  it('shows the native restart action when Desktop provides it', () => {
    const restart = vi.fn();
    renderNotice({
      status: 'disconnected',
      waitingForConfig: true,
      restarting: false,
      retry: vi.fn(),
      restart
    });

    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));
    expect(restart).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/当前内容会保留/)).toBeInTheDocument();
  });
});
