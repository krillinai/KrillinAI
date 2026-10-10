import type { DownloadPlatform, VideoMetadataResponse } from '@opencreator/protocol';
import { spawnCreatorProcess } from '../creator/process-tree.js';
import { withYtDlpProxy } from '../creator/yt-dlp/args.js';
import type { YtDlpRuntime } from '../creator/yt-dlp/runtime.js';

export async function resolveOnlineVideoMetadata(input: {
  url: string;
  platform: DownloadPlatform;
  runtime: YtDlpRuntime;
  proxy: string;
}): Promise<VideoMetadataResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  timeout.unref();
  try {
    const payload = await new Promise<unknown>((resolve, reject) => {
      const child = spawnCreatorProcess(input.runtime.executable, [
        ...input.runtime.prefixArgs,
        ...withYtDlpProxy([
          '--encoding', 'utf-8', '--skip-download', '--dump-single-json',
          '--no-playlist', '--no-warnings', '--ignore-no-formats-error',
          '--socket-timeout', '8', '--retries', '0', '--', input.url
        ], input.proxy)
      ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...input.runtime.env } }, controller.signal);
      const chunks: Buffer[] = [];
      let size = 0;
      child.stdout?.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) {
          controller.abort();
          reject(new Error('Video preview metadata is too large'));
          return;
        }
        chunks.push(chunk);
      });
      // Drain diagnostics without returning extractor output or signed URLs in errors.
      child.stderr?.on('data', () => undefined);
      child.once('error', reject);
      child.once('close', code => {
        if (code !== 0 || controller.signal.aborted) {
          reject(new Error('Online video preview could not be resolved'));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('Video preview metadata is invalid')); }
      });
    });
    return parseOnlineVideoMetadata(payload, input.platform);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseOnlineVideoMetadata(payload: unknown, platform: DownloadPlatform): VideoMetadataResponse {
  if (!isRecord(payload)) throw new Error('Video preview metadata is invalid');
  const formats = Array.isArray(payload.formats) ? payload.formats.filter(isRecord) : [];
  const silentSource = payload.acodec === 'none' && !Array.isArray(payload.requested_formats);
  // Native video playback requires a single progressive resource, not separate audio/video tracks or an HLS manifest.
  const playable = [payload, ...formats].filter(format => {
    const protocol = format.protocol;
    return safeMediaUrl(format.url) !== undefined
      && (protocol === undefined || protocol === 'https' || protocol === 'http')
      && format.ext === 'mp4'
      && (typeof format.vcodec === 'string' && /^(?:avc1|h264)/i.test(format.vcodec)
        || format.vcodec == null && dimension(format.width) !== undefined && dimension(format.height) !== undefined)
      && (typeof format.acodec === 'string' && /^(?:mp4a|aac)/i.test(format.acodec)
        || format.acodec == null || format.acodec === 'none' && silentSource)
      && !Array.isArray(format.requested_formats);
  }).sort((left, right) => score(right) - score(left))[0];
  const previewUrl = safeMediaUrl(playable?.url);
  const thumbnailUrl = safeMediaUrl(payload.thumbnail);
  const authorName = boundedText(payload.uploader ?? payload.creator, 160);
  const width = dimension(playable?.width ?? payload.width);
  const height = dimension(playable?.height ?? payload.height);
  return {
    platform,
    title: boundedText(payload.title, 300) ?? boundedText(payload.id, 128) ?? platform,
    ...(previewUrl === undefined ? {} : { previewUrl }),
    ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
    ...(authorName === undefined ? {} : { authorName }),
    ...(width === undefined || height === undefined ? {} : { width, height })
  };
}

function score(format: Record<string, unknown>): number {
  const height = dimension(format.height) ?? 0;
  return height <= 1080 ? height : -height;
}

function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}

function boundedText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function dimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 16_384 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
