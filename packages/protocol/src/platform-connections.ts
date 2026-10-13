export type ConnectionPlatform = 'youtube' | 'douyin';

export type PlatformConnectionState = {
  platform: ConnectionPlatform;
  status: 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';
  browser?: 'chrome' | 'edge';
  connectedAt?: string;
  profileId?: string;
  profiles?: Array<{ id: string; browser: 'chrome' | 'edge'; label: string }>;
  message?: string;
};

export type YouTubeConnectionState = PlatformConnectionState & { platform: 'youtube' };
