import type { CodexImageStatus } from '@opencreator/protocol';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import { CodexImageStatusNotice } from './CodexImageStatusNotice.js';

const native: CodexImageStatus = { authentication: 'chatgpt', ready: true, executionMode: 'native', version: 'codex 0.149.0', message: '本地 ChatGPT 凭据和工具已就绪' };
const api: CodexImageStatus = { authentication: 'api_key', ready: true, executionMode: 'api', message: '接口需支持图片生成' };
function service(getCodexImageStatus: () => Promise<CodexImageStatus>): CreatorServicesSettingsService {
  return { getCodexImageStatus } as CreatorServicesSettingsService;
}

describe('Codex image status notice', () => {
  it('distinguishes native login from API mode and never claims real generation is verified', async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(native).mockResolvedValue(api);
    render(<CodexImageStatusNotice service={service(getStatus)} />);
    expect(await screen.findByText('ChatGPT 登录态 · 原生生图')).toBeInTheDocument();
    expect(screen.getByText('Runtime 版本: codex 0.149.0')).toBeInTheDocument();
    expect(screen.getByText(/以实际生成结果为准/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(await screen.findByText('API Key · 图片接口')).toBeInTheDocument();
    expect(screen.getByText('接口需支持图片生成')).toBeInTheDocument();
  });

  it('offers the real Agent setup callback when login or capability is unavailable', async () => {
    const onOpenAgentSetup = vi.fn();
    render(<CodexImageStatusNotice service={service(async () => ({ authentication: 'chatgpt', ready: false, executionMode: null, message: '请重新登录' }))} onOpenAgentSetup={onOpenAgentSetup} />);
    expect(await screen.findByText('请重新登录')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '配置 Agent' }));
    expect(onOpenAgentSetup).toHaveBeenCalledOnce();
    expect(screen.queryByText(/以实际生成结果为准/)).not.toBeInTheDocument();
  });

  it('does not render inactive buttons when callbacks or status support are absent', () => {
    render(<CodexImageStatusNotice service={null} />);
    expect(screen.getByText(/当前 Runtime 无法检查生图能力/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('supports retry after status errors and refreshes on window focus', async () => {
    const getStatus = vi.fn().mockRejectedValueOnce(new Error('private runtime details')).mockResolvedValue(native);
    render(<CodexImageStatusNotice service={service(getStatus)} />);
    expect(await screen.findByText(/无法读取生图状态/)).toBeInTheDocument();
    expect(screen.queryByText('private runtime details')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(await screen.findByText(native.message)).toBeInTheDocument();
    fireEvent.focus(window);
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(3));
  });
});
