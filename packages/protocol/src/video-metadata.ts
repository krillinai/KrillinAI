export type VideoMetadataPlatform = 'youtube' | 'bilibili';

export type VideoSourcePart = {
  index: number;
  title: string;
  cid?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
};

export type VideoMetadataResponse = {
  platform: VideoMetadataPlatform;
  title: string;
  authorName?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  parts?: VideoSourcePart[];
  selectedPart?: VideoSourcePart;
};

export function parseBilibiliVideoSource(value: string): {
  videoId: string;
  partIndex?: number;
  url: string;
} | null {
  try {
    const source = new URL(value.trim());
    const host = source.hostname.toLowerCase();
    if ((source.protocol !== 'https:' && source.protocol !== 'http:')
      || (host !== 'bilibili.com' && !host.endsWith('.bilibili.com'))) return null;
    const videoId = source.pathname.match(/^\/video\/(BV[A-Za-z0-9]+|av\d+)\/?$/)?.[1];
    if (!videoId) return null;
    const parts = source.searchParams.getAll('p');
    if (parts.length > 1) return null;
    const partIndex = parts.length === 0 ? undefined : Number(parts[0]);
    if (partIndex !== undefined && (!/^[1-9]\d*$/.test(parts[0]!)
      || !Number.isSafeInteger(partIndex))) return null;
    return {
      videoId,
      ...(partIndex === undefined ? {} : { partIndex }),
      url: `https://www.bilibili.com/video/${videoId}${partIndex === undefined ? '' : `?p=${partIndex}`}`
    };
  } catch {
    return null;
  }
}

export function videoSourceIdentity(value: string): string | null {
  const bilibili = parseBilibiliVideoSource(value);
  if (bilibili !== null) return `bilibili:${bilibili.videoId}:p${bilibili.partIndex ?? 1}`;
  try {
    const source = new URL(value.trim());
    if (source.protocol !== 'http:' && source.protocol !== 'https:') return null;
    const host = source.hostname.toLowerCase();
    const videoId = host === 'youtu.be'
      ? source.pathname.split('/').filter(Boolean)[0]
      : host === 'youtube.com' || host.endsWith('.youtube.com')
        ? source.searchParams.get('v') || source.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1]
        : undefined;
    return videoId && /^[A-Za-z0-9_-]+$/.test(videoId) ? `youtube:${videoId}` : null;
  } catch {
    return null;
  }
}
