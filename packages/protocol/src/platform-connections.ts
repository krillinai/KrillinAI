export type YouTubeConnectionState = {
  platform: 'youtube';
  status: 'disconnected' | 'connecting' | 'connected' | 'expired' | 'error';
  browser?: 'chrome' | 'edge';
  connectedAt?: string;
  profileId?: string;
  profiles?: Array<{ id: string; browser: 'chrome' | 'edge'; label: string }>;
  message?: string;
  connectionMethod?: 'browser-login';
  actionRequired?: 'complete-login' | 'close-login-browser';
};
