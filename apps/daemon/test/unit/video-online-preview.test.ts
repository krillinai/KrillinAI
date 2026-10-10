import { describe, expect, it } from 'vitest';
import { parseOnlineVideoMetadata, resolveOnlineVideoMetadata } from '../../src/video-metadata/online-preview.js';

const progressive = { url: 'https://media.example.com/video.mp4?token=signed', protocol: 'https', ext: 'mp4', vcodec: 'avc1.64001f', acodec: 'mp4a.40.2', width: 1920, height: 1080 };

describe('online video preview resolution', () => {
  it('chooses a progressive video with audio and excludes HLS, split tracks, incompatible codecs and unsafe URLs', () => {
    const metadata = parseOnlineVideoMetadata({ title: '  Preview title  ', uploader: 'Creator', thumbnail: 'https://media.example.com/cover.jpg',
      formats: [
        { ...progressive, height: 2160, url: 'https://media.example.com/4k.mp4' },
        { ...progressive, acodec: 'none', url: 'https://media.example.com/video-only.mp4' },
        { ...progressive, protocol: 'm3u8_native', url: 'https://media.example.com/list.m3u8' },
        { ...progressive, vcodec: 'hevc', url: 'https://media.example.com/hevc.mp4' },
        { ...progressive, url: 'javascript:alert(1)' },
        progressive
      ]
    }, 'douyin');
    expect(metadata).toEqual({ platform: 'douyin', title: 'Preview title', authorName: 'Creator', thumbnailUrl: 'https://media.example.com/cover.jpg',
      previewUrl: progressive.url, width: 1920, height: 1080 });
  });

  it('retains the poster and title when there is no native playback format', () => {
    expect(parseOnlineVideoMetadata({ title: 'Poster only', thumbnail: 'https://media.example.com/cover.jpg', formats: [
      { ...progressive, protocol: 'm3u8_native' }
    ] }, 'pinterest')).toEqual({ platform: 'pinterest', title: 'Poster only', thumbnailUrl: 'https://media.example.com/cover.jpg' });
  });

  it('resolves metadata with skip-download and uses the configured runtime and proxy', async () => {
    const script = `process.stdout.write(JSON.stringify({title:process.argv.slice(1).join(' '),formats:[${JSON.stringify(progressive)}]}))`;
    const result = await resolveOnlineVideoMetadata({ url: 'https://v.douyin.com/example/', platform: 'douyin', proxy: 'http://127.0.0.1:7897',
      runtime: { version: 'test', executable: process.execPath, prefixArgs: ['-e', script, '--'], env: {} } });
    expect(result.previewUrl).toBe(progressive.url);
    expect(result.title).toContain('--skip-download');
    expect(result.title).toContain('--dump-single-json');
    expect(result.title).toContain('--proxy http://127.0.0.1:7897');
    expect(result.title).toContain('https://v.douyin.com/example/');
  });

  it('rejects an extractor failure without exposing its diagnostics', async () => {
    await expect(resolveOnlineVideoMetadata({ url: 'https://v.douyin.com/example/', platform: 'douyin', proxy: '',
      runtime: { version: 'test', executable: process.execPath, prefixArgs: ['-e', 'process.stderr.write("sensitive signed URL");process.exit(1)', '--'], env: {} }
    })).rejects.toThrow('Online video preview could not be resolved');
  });
});
