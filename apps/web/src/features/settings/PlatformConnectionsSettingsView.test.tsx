import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { YouTubeConnectionState } from '@opencreator/protocol';
import { PlatformConnectionsSettingsView } from './PlatformConnectionsSettingsView.js';

function api(initial: YouTubeConnectionState['status'] = 'disconnected') {
  let state: YouTubeConnectionState = { platform: 'youtube', status: initial };
  return {
    getYouTube: vi.fn(async () => state),
    connectYouTube: vi.fn(async () => state = { platform: 'youtube', status: 'connecting' }),
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
