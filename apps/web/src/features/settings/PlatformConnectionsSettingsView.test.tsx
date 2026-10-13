import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { YouTubeConnectionState } from '@opencreator/protocol';
import { PlatformConnectionsSettingsView } from './PlatformConnectionsSettingsView.js';

const windowsState: YouTubeConnectionState = { platform: 'youtube', status: 'disconnected', connectionMethod: 'browser-login' };
const loginState: YouTubeConnectionState = { ...windowsState, status: 'connecting', actionRequired: 'complete-login',
  message: '请在打开的 Chrome 窗口中登录 YouTube' };

function api(initial: YouTubeConnectionState['status'] = 'disconnected') {
  let state: YouTubeConnectionState = { platform: 'youtube', status: initial };
  return {
    getYouTube: vi.fn(async () => state),
    connectYouTube: vi.fn(async (): Promise<YouTubeConnectionState> => state = { platform: 'youtube', status: 'connecting' }),
    completeYouTubeLogin: vi.fn(async (): Promise<YouTubeConnectionState> => state = { ...windowsState, status: 'connected' }),
    cancelYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'disconnected' }),
    disconnectYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'disconnected' }),
    importYouTube: vi.fn(async () => state),
    finish: () => { state = { platform: 'youtube', status: 'connected' }; }
  };
}

it('connects with one click, polls automatic completion, and allows disconnect', async () => {
  const service = api(); const user = userEvent.setup();
  render(<PlatformConnectionsSettingsView connected service={service} />);
  await screen.findByText('未连接');
  await user.click(screen.getByRole('button', { name: '连接' }));
  expect(service.connectYouTube).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('正在读取浏览器登录态');
  service.finish();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已连接'), { timeout: 3000 });
  await user.click(screen.getByRole('button', { name: '断开' }));
  expect(service.disconnectYouTube).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('未连接');
});

it('cancels a login and disables actions when the runtime is disconnected', async () => {
  const service = api('connecting'); const user = userEvent.setup();
  const view = render(<PlatformConnectionsSettingsView connected service={service} />);
  await user.click(await screen.findByRole('button', { name: '取消' }));
  expect(service.cancelYouTube).toHaveBeenCalledTimes(1);
  view.rerender(<PlatformConnectionsSettingsView connected={false} service={service} />);
  expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();
});

it('preserves browser profile selection and the original macOS connection interface', async () => {
  const service = api(); const user = userEvent.setup();
  service.getYouTube.mockResolvedValue({ platform: 'youtube', status: 'disconnected', profiles: [
    { id: 'a'.repeat(24), browser: 'chrome', label: 'Chrome · 原账号' },
    { id: 'b'.repeat(24), browser: 'edge', label: 'Edge · 第二账号' }
  ] });
  render(<PlatformConnectionsSettingsView connected service={service} />);
  await user.selectOptions(await screen.findByRole('combobox', { name: '浏览器账号' }), 'b'.repeat(24));
  await user.click(screen.getByRole('button', { name: '连接' }));
  expect(service.connectYouTube).toHaveBeenCalledWith('b'.repeat(24));
  expect(screen.queryByRole('button', { name: '下载浏览器连接器' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('连接码')).not.toBeInTheDocument();
});

it('Windows 一键打开专用登录，完成后连接，不显示连接码或关闭原浏览器确认', async () => {
  const service = api(); const user = userEvent.setup();
  service.getYouTube.mockResolvedValue(windowsState);
  service.connectYouTube.mockResolvedValue(loginState);
  render(<PlatformConnectionsSettingsView connected service={service} />);
  await screen.findByText('未连接');
  await user.click(screen.getByRole('button', { name: '连接' }));
  expect(service.connectYouTube).toHaveBeenCalledWith(undefined);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('连接码')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(loginState.message!);
  await user.click(screen.getByRole('button', { name: '完成登录' }));
  expect(service.completeYouTubeLogin).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('已连接');
});

it('专用窗口关闭失败后可再次完成登录，提示只关闭该窗口', async () => {
  const service = api(); const user = userEvent.setup();
  const failed: YouTubeConnectionState = { ...loginState, actionRequired: 'close-login-browser',
    message: '请关闭刚才打开的 YouTube 登录窗口，再点击“完成登录”。其他 Chrome 窗口可以保持打开。' };
  service.getYouTube.mockResolvedValue(failed);
  render(<PlatformConnectionsSettingsView connected service={service} />);
  await screen.findByText(failed.message!);
  await user.click(screen.getByRole('button', { name: '完成登录' }));
  expect(service.completeYouTubeLogin).toHaveBeenCalledTimes(1);
  expect(service.connectYouTube).not.toHaveBeenCalled();
});

it('专用登录可取消，Runtime 断开时完成登录和取消均禁用', async () => {
  const service = api(); const user = userEvent.setup();
  service.getYouTube.mockResolvedValue(loginState);
  const view = render(<PlatformConnectionsSettingsView connected service={service} />);
  await screen.findByRole('button', { name: '完成登录' });
  view.rerender(<PlatformConnectionsSettingsView connected={false} service={service} />);
  expect(screen.getByRole('button', { name: '完成登录' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
  view.rerender(<PlatformConnectionsSettingsView connected service={service} />);
  await user.click(screen.getByRole('button', { name: '取消' }));
  expect(service.cancelYouTube).toHaveBeenCalledTimes(1);
  expect(service.completeYouTubeLogin).not.toHaveBeenCalled();
});

it('连接状态加载完成前禁用连接', () => {
  const service = api();
  service.getYouTube.mockImplementation(() => new Promise(() => {}));
  render(<PlatformConnectionsSettingsView connected service={service} />);
  expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();
});

it('keeps file import available on Windows and disables actions when the Runtime disconnects', async () => {
  const service = api();
  service.getYouTube.mockResolvedValue(windowsState);
  const view = render(<PlatformConnectionsSettingsView connected service={service} />);
  expect(await screen.findByRole('button', { name: '导入 Cookie 文件' })).toBeEnabled();
  view.rerender(<PlatformConnectionsSettingsView connected={false} service={service} />);
  expect(screen.getByRole('button', { name: '连接' })).toBeDisabled();
});
