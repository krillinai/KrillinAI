import { PlatformConnectionService, type PlatformConnectionOptions } from './service.js';

export class YouTubeConnectionService extends PlatformConnectionService<'youtube'> {
  constructor({ platform, ...input }: Omit<PlatformConnectionOptions, 'platform' | 'osPlatform'> & { platform?: NodeJS.Platform }) {
    super({ ...input, platform: 'youtube', osPlatform: platform });
  }
}
