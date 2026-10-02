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
