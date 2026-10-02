import type { CodexImageStatus } from '@opencreator/protocol';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import { CodexImageStatusNotice } from './CodexImageStatusNotice.js';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { LanguageSwitchControls } from '../../test/LanguageSwitchControls.js';

const native: CodexImageStatus = { authentication: 'chatgpt', ready: true, executionMode: 'native', version: 'codex 0.149.0', message: '本地 ChatGPT 凭据和工具已就绪' };
const api: CodexImageStatus = { authentication: 'api_key', ready: true, executionMode: 'api', message: '接口需支持图片生成' };
function service(getCodexImageStatus: () => Promise<CodexImageStatus>): CreatorServicesSettingsService {
  return { getCodexImageStatus } as CreatorServicesSettingsService;
}

describe('Codex image status notice', () => {
  it.each([native, api])('switches ready $executionMode status without exposing backend copy or rechecking capabilities', async status => {
    const getStatus = vi.fn(async () => status);
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><CodexImageStatusNotice service={service(getStatus)} /></LanguageProvider>);
    await screen.findByText(status.executionMode === 'native' ? /无需额外配置图片 API Key/ : /当前接口和模型需要支持图片生成/);
    fireEvent.click(screen.getByRole('button', { name: 'en-US' }));
    expect(screen.getByText(status.executionMode === 'native' ? /Local ChatGPT credentials/ : /Codex API configuration was detected/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText(status.executionMode === 'native' ? /Lokala ChatGPT-inloggningsuppgifter/ : /API-inställningar för Codex/)).toBeVisible();
    expect(screen.queryByText(status.message)).not.toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledOnce();
  });

  it('switches a not-ready explanation and keeps the raw reason in diagnostics', async () => {
    const raw = '当前 Codex Runtime 不支持原生生图';
    render(<LanguageProvider initialPreference="en-US"><LanguageSwitchControls /><CodexImageStatusNotice service={service(async () => ({ authentication: 'chatgpt', ready: false, executionMode: null, message: raw }))} /></LanguageProvider>);
    expect(await screen.findByText(/Check Agent sign-in, configuration, and Runtime tool support/)).toBeVisible();
    expect(screen.getByText(raw)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText(/Kontrollera Agent-inloggningen/)).toBeVisible();
    fireEvent.click(screen.getByText('Visa ursprunglig diagnostik'));
    expect(screen.getByText(raw)).toBeVisible();
  });

  it('distinguishes native login from API mode and never claims real generation is verified', async () => {
    const getStatus = vi.fn().mockResolvedValueOnce(native).mockResolvedValue(api);
    render(<CodexImageStatusNotice service={service(getStatus)} />);
    expect(await screen.findByText('ChatGPT 登录态 · 原生生图')).toBeInTheDocument();
    expect(screen.getByText('Runtime 版本: codex 0.149.0')).toBeInTheDocument();
    expect(screen.getByText(/以实际生成结果为准/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(await screen.findByText('API Key · 图片接口')).toBeInTheDocument();
    expect(screen.getByText(/当前接口和模型需要支持图片生成/)).toBeVisible();
    expect(screen.queryByText(api.message)).not.toBeInTheDocument();
  });

  it('offers the real Agent setup callback when login or capability is unavailable', async () => {
    const onOpenAgentSetup = vi.fn();
    render(<CodexImageStatusNotice service={service(async () => ({ authentication: 'chatgpt', ready: false, executionMode: null, message: '请重新登录' }))} onOpenAgentSetup={onOpenAgentSetup} />);
    expect(await screen.findByText(/请检查 Agent 登录、配置和 Runtime 工具支持/)).toBeVisible();
    expect(screen.getByText('请重新登录')).not.toBeVisible();
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
    expect(await screen.findByText(/无需额外配置图片 API Key/)).toBeVisible();
    fireEvent.focus(window);
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(3));
  });
});
