import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeRecoveryContext, RuntimeRecoveryNotice } from './runtime-recovery.js';
import type { RuntimeRecovery } from './use-runtime-connection.js';

describe('Runtime recovery controls', () => {
  it('shows automatic recovery and invokes the real supported restart after confirmation', async () => {
    const retry = vi.fn(async () => undefined);
    const restart = vi.fn(async () => undefined);
    const recovery: RuntimeRecovery = {
      state: { status: 'disconnected', message: 'offline' }, phase: 'reconnecting', attempt: 2, epoch: 1, retry, restart
    };
    const view = render(<RuntimeRecoveryContext.Provider value={recovery}><RuntimeRecoveryNotice /></RuntimeRecoveryContext.Provider>);
    expect(screen.getByText(/正在自动重连/)).toBeVisible();
    expect(screen.getByText(/不会重复启动任务/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重新连接' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));
    expect(restart).toHaveBeenCalledTimes(1);
    view.rerender(<RuntimeRecoveryContext.Provider value={{ ...recovery, restart: undefined }}><RuntimeRecoveryNotice /></RuntimeRecoveryContext.Provider>);
    expect(screen.queryByRole('button', { name: '重启本地服务' })).not.toBeInTheDocument();
  });

  it('distinguishes a failed session from a healthy Runtime', () => {
    render(<RuntimeRecoveryContext.Provider value={{ state: { status: 'connected' }, phase: 'connected', attempt: 0, epoch: 1, retry: vi.fn() }}>
      <RuntimeRecoveryNotice session={{ status: 'failed', attempt: 1 }} onRetrySession={vi.fn()} />
    </RuntimeRecoveryContext.Provider>);
    expect(screen.getByText('服务已连接，但项目会话恢复失败。')).toBeVisible();
    expect(screen.queryByText(/正在自动重连/)).not.toBeInTheDocument();
  });
});
