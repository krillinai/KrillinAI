import { describe, expect, it } from 'vitest';
import { parseBilibiliVideoSource } from '../src/video-metadata.js';

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
