import { describe, expect, it } from 'vitest';
import { parseBilibiliVideoSource, videoSourceIdentity } from '../src/video-metadata.js';

describe('Bilibili video sources', () => {
  it('preserves the selected part while removing tracking parameters', () => {
    expect(parseBilibiliVideoSource('https://www.bilibili.com/video/BV18E421w7bf/?spm_id_from=share&vd_source=tracking&p=3'))
      .toEqual({ videoId: 'BV18E421w7bf', partIndex: 3, url: 'https://www.bilibili.com/video/BV18E421w7bf?p=3' });
  });

  it('does not silently select P1 when the link has no part', () => {
    expect(parseBilibiliVideoSource('https://www.bilibili.com/video/av123/'))
      .toEqual({ videoId: 'av123', url: 'https://www.bilibili.com/video/av123' });
  });

  it.each(['0', '-1', '1.5', '', 'abc', '9007199254740992', '2&p=3'])(
    'rejects an invalid or ambiguous part: %s', part => {
      expect(parseBilibiliVideoSource(`https://www.bilibili.com/video/BV18E421w7bf?p=${part}`)).toBeNull();
    }
  );

  it('rejects lookalike hosts', () => {
    expect(parseBilibiliVideoSource('https://notbilibili.com/video/BV18E421w7bf?p=3')).toBeNull();
  });
});

describe('video source identity', () => {
  it('ignores tracking but keeps Bilibili parts distinct', () => {
    const source = 'https://www.bilibili.com/video/BV18E421w7bf';
    expect(videoSourceIdentity(`${source}/?spm_id_from=share&p=3`)).toBe(videoSourceIdentity(`${source}?p=3&vd_source=other`));
    expect(videoSourceIdentity(`${source}?p=3`)).not.toBe(videoSourceIdentity(`${source}?p=2`));
    expect(videoSourceIdentity(source)).toBe(videoSourceIdentity(`${source}?p=1`));
    expect(videoSourceIdentity(`${source}?p=invalid`)).toBeNull();
  });

  it.each(['https://youtu.be/demo?si=share', 'https://www.youtube.com/watch?v=demo&t=30',
    'https://www.youtube.com/shorts/demo', 'https://www.youtube.com/embed/demo', 'https://www.youtube.com/live/demo'])('recognizes the same YouTube video: %s', source => {
    expect(videoSourceIdentity(source)).toBe('youtube:demo');
  });

  it.each(['https://notyoutube.com/watch?v=demo', 'https://notbilibili.com/video/BV18E421w7bf', 'file:///tmp/video.mp4', 'not a URL'])('rejects unsupported sources: %s', source => {
    expect(videoSourceIdentity(source)).toBeNull();
  });
});
