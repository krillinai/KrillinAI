import type { PlatformConnectionState, YouTubeConnectionState } from '@opencreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

export function createPlatformConnectionsService(client: Pick<RuntimeClient, 'get' | 'post' | 'delete'>) {
  const path = '/platform-connections/youtube';
  const douyinPath = '/platform-connections/douyin';
  return {
    getYouTube(): Promise<YouTubeConnectionState> { return client.get(path); },
    connectYouTube(profileId?: string): Promise<YouTubeConnectionState> {
      return client.post(`${path}/connect`, { profileId });
    },
    completeYouTubeLogin(): Promise<YouTubeConnectionState> { return client.post(`${path}/complete-login`); },
    cancelYouTube(): Promise<YouTubeConnectionState> { return client.post(`${path}/cancel`); },
    disconnectYouTube(): Promise<YouTubeConnectionState> { return client.delete(path); },
    importYouTube(cookies: string): Promise<YouTubeConnectionState> { return client.post(`${path}/import`, { cookies }); },
    getDouyin(): Promise<PlatformConnectionState> { return client.get(douyinPath); },
    connectDouyin(profileId?: string): Promise<PlatformConnectionState> { return client.post(`${douyinPath}/connect`, { profileId }); },
    cancelDouyin(): Promise<PlatformConnectionState> { return client.post(`${douyinPath}/cancel`); },
    disconnectDouyin(): Promise<PlatformConnectionState> { return client.delete(douyinPath); },
    importDouyin(cookies: string): Promise<PlatformConnectionState> { return client.post(`${douyinPath}/import`, { cookies }); }
  };
}

export type PlatformConnectionsService = ReturnType<typeof createPlatformConnectionsService>;
