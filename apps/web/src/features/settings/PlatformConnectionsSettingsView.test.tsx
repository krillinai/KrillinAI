import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { PlatformConnectionState, YouTubeConnectionState } from '@opencreator/protocol';
import { PlatformConnectionsSettingsView } from './PlatformConnectionsSettingsView.js';

function api(initial: YouTubeConnectionState['status'] = 'disconnected') {
  let state: YouTubeConnectionState = { platform: 'youtube', status: initial };
  let douyin: PlatformConnectionState = { platform: 'douyin', status: 'disconnected' };
  return {
    getYouTube: vi.fn(async () => state),
    connectYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'connecting' }),
    cancelYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'disconnected' }),
    disconnectYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'disconnected' }),
    importYouTube: vi.fn(async () => state),
    getDouyin: vi.fn(async () => douyin),
    connectDouyin: vi.fn(async () => douyin = { platform: 'douyin', status: 'connecting' }),
    cancelDouyin: vi.fn(async () => douyin = { platform: 'douyin', status: 'disconnected' }),
    disconnectDouyin: vi.fn(async () => douyin = { platform: 'douyin', status: 'disconnected' }),
    importDouyin: vi.fn(async () => douyin = { platform: 'douyin', status: 'connected' }),
    finish: () => { state = { platform: 'youtube', status: 'connected' }; }
  };
}

it('connects with one click, polls automatic completion, and allows disconnect', async () => {
  const service = api(); const user = userEvent.setup();
  render(<PlatformConnectionsSettingsView connected service={service} />);
  const row = within(screen.getByRole('group', { name: 'YouTube' }));
  await row.findByText('未连接');
  await user.click(row.getByRole('button', { name: '连接' }));
  expect(service.connectYouTube).toHaveBeenCalledTimes(1);
  expect(row.getByRole('status')).toHaveTextContent('正在读取浏览器登录态');
  service.finish();
  await waitFor(() => expect(row.getByRole('status')).toHaveTextContent('已连接'), { timeout: 3000 });
  await user.click(row.getByRole('button', { name: '断开' }));
  expect(service.disconnectYouTube).toHaveBeenCalledTimes(1);
  expect(row.getByRole('status')).toHaveTextContent('未连接');
});

it('cancels a login and disables actions when the runtime is disconnected', async () => {
  const service = api('connecting'); const user = userEvent.setup();
  const view = render(<PlatformConnectionsSettingsView connected service={service} />);
  const row = within(screen.getByRole('group', { name: 'YouTube' }));
  await user.click(await row.findByRole('button', { name: '取消' }));
  expect(service.cancelYouTube).toHaveBeenCalledTimes(1);
  view.rerender(<PlatformConnectionsSettingsView connected={false} service={service} />);
  expect(row.getByRole('button', { name: '连接' })).toBeDisabled();
  expect(within(screen.getByRole('group', { name: '抖音' })).getByRole('button', { name: '连接' })).toBeDisabled();
});

it('connects and cancels the Douyin session independently of YouTube', async () => {
  const service = api(); const user = userEvent.setup();
  render(<PlatformConnectionsSettingsView connected service={service} />);
  const row = within(screen.getByRole('group', { name: '抖音' }));
  await row.findByText('未连接');
  await user.click(row.getByRole('button', { name: '连接' }));
  expect(service.connectDouyin).toHaveBeenCalledTimes(1);
  expect(service.connectYouTube).not.toHaveBeenCalled();
  expect(row.getByRole('status')).toHaveTextContent('正在读取浏览器会话');
  await user.click(row.getByRole('button', { name: '取消' }));
  expect(service.cancelDouyin).toHaveBeenCalledTimes(1);
  expect(row.getByRole('status')).toHaveTextContent('未连接');
});

it('imports a Douyin cookie file without changing the YouTube connection', async () => {
  const service = api(); const user = userEvent.setup();
  const view = render(<PlatformConnectionsSettingsView connected service={service} />);
  const group = screen.getByRole('group', { name: '抖音' });
  const row = within(group);
  const file = new File(['# Netscape HTTP Cookie File\n'], 'douyin.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => '# Netscape HTTP Cookie File\n' });
  await user.upload(group.querySelector('input[type=file]')!, file);
  await waitFor(() => expect(service.importDouyin).toHaveBeenCalledWith('# Netscape HTTP Cookie File\n'));
  expect(service.importYouTube).not.toHaveBeenCalled();
  expect(row.getByRole('status')).toHaveTextContent('已连接');
  await user.click(row.getByRole('button', { name: '断开' }));
  expect(service.disconnectDouyin).toHaveBeenCalledTimes(1);
  view.unmount();
});
