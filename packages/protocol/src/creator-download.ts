export type DownloadPlatform = 'youtube' | 'bilibili' | 'x' | 'tiktok' | 'instagram' | 'douyin' | 'facebook' | 'xiaohongshu' | 'pinterest';

export function extractDouyinShareUrl(value: string): string {
  const trimmed = value.trim();
  if (/^https:\/\/\S+$/.test(trimmed)) return trimmed;
  const links = [...new Set(trimmed.match(/https:\/\/v\.douyin\.com\/[\w-]+\/?(?=$|[\s)\]），。！!])/g) ?? [])];
  return links.length === 1 ? links[0]! : trimmed;
}

export function normalizeVideoSourceUrl(value: string): string {
  const trimmed = extractDouyinShareUrl(value);
  try {
    const url = new URL(trimmed);
    if (isDouyinFeaturedVideoUrl(url)) {
      return `https://www.douyin.com/video/${url.searchParams.get('modal_id')}`;
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function supportedVideoSourcePlatform(value: string): DownloadPlatform | null {
  try {
    const url = new URL(normalizeVideoSourceUrl(value));
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
    if (host === 'b23.tv' || host === 'bilibili.com' || host.endsWith('.bilibili.com')) return 'bilibili';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
    if (isTikTokVideoUrl(url)) return 'tiktok';
    if (isInstagramVideoUrl(url)) return 'instagram';
    if (isDouyinVideoUrl(url)) return 'douyin';
    if (isFacebookVideoUrl(url)) return 'facebook';
    if (isXiaohongshuVideoUrl(url)) return 'xiaohongshu';
    if (isPinterestVideoUrl(url)) return 'pinterest';
  } catch {
    return null;
  }
  return null;
}

function isTikTokVideoUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return /^\/[\w-]+\/?$/.test(url.pathname);
  return (host === 'tiktok.com' || host.endsWith('.tiktok.com')) && /^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname);
}

function isInstagramVideoUrl(url: URL): boolean {
  return ['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase())
    && /^\/(?:reel|p|tv)\/[\w-]+\/?$/.test(url.pathname);
}

function isDouyinVideoUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'v.douyin.com') return /^\/[\w-]+\/?$/.test(url.pathname);
  return ['douyin.com', 'www.douyin.com'].includes(host)
    && (/^\/video\/\d+\/?$/.test(url.pathname) || isDouyinFeaturedVideoUrl(url));
}

function isDouyinFeaturedVideoUrl(url: URL): boolean {
  return ['douyin.com', 'www.douyin.com'].includes(url.hostname.toLowerCase())
    && url.pathname === '/jingxuan' && /^\d+$/.test(url.searchParams.get('modal_id') ?? '');
}

function isFacebookVideoUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'fb.watch') return /^\/[\w-]+\/?$/.test(url.pathname);
  if (!['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(host)) return false;
  return /^\/watch\/?$/.test(url.pathname)
    ? /^\d+$/.test(url.searchParams.get('v') ?? '')
    : /^\/(?:reel\/\d+|videos\/\d+|[^/]+\/videos\/\d+)\/?$/.test(url.pathname);
}

function isXiaohongshuVideoUrl(url: URL): boolean {
  return ['xiaohongshu.com', 'www.xiaohongshu.com'].includes(url.hostname.toLowerCase())
    && /^\/explore\/[0-9a-f]{24}\/?$/i.test(url.pathname);
}

function isPinterestVideoUrl(url: URL): boolean {
  return ['pinterest.com', 'www.pinterest.com'].includes(url.hostname.toLowerCase()) && /^\/pin\/\d+\/?$/.test(url.pathname);
}

export type DownloadMediaType = 'video' | 'audio';

export type DownloadContainer = 'mp4' | 'mp3' | 'm4a' | 'webm';

export type DownloadOption = {
  id: string;
  mediaType: DownloadMediaType;
  container: DownloadContainer;
  audioLanguage?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  estimatedBytes?: number;
  videoFormatId?: string;
  audioFormatId?: string;
  transcode?: 'mp3';
  playlistIndex?: number;
};

export type DownloadProbeFormat = {
  id: string;
  ext: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  bytes: number | null;
  language?: string | null;
  languagePreference?: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
};

export type DownloadProbe = {
  id: string;
  title: string;
  requestedUrl: string;
  url: string;
  platform: DownloadPlatform;
  uploader: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  formats: DownloadProbeFormat[];
  options: DownloadOption[];
};
