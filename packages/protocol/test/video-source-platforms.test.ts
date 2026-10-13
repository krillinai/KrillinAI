import { describe, expect, it } from 'vitest';
import { normalizeVideoSourceUrl, supportedVideoSourcePlatform } from '../src/creator-download.js';
import { videoSourceIdentity } from '../src/video-metadata.js';

describe('shared public video sources', () => {
  it.each([
    ['youtube', 'https://youtu.be/demo?si=share'],
    ['bilibili', 'https://www.bilibili.com/video/BV18E421w7bf?p=3'],
    ['bilibili', 'https://b23.tv/abc123'],
    ['x', 'https://x.com/creator/status/123'],
    ['x', 'https://twitter.com/creator/status/123'],
    ['tiktok', 'https://www.tiktok.com/@creator/video/123'],
    ['tiktok', 'https://vm.tiktok.com/abc123/'],
    ['instagram', 'https://www.instagram.com/reel/abc123/'],
    ['douyin', 'https://www.douyin.com/video/123'],
    ['douyin', 'https://v.douyin.com/abc123/'],
    ['facebook', 'https://www.facebook.com/watch/?v=123'],
    ['facebook', 'https://fb.watch/abc123/'],
    ['xiaohongshu', 'https://www.xiaohongshu.com/explore/6a9149f3000000001f01d20a?xsec_token=sample%3D'],
    ['pinterest', 'https://www.pinterest.com/pin/123/']
  ])('accepts %s videos and identifies them for saved previews: %s', (platform, url) => {
    expect(supportedVideoSourcePlatform(url)).toBe(platform);
    expect(videoSourceIdentity(url)).not.toBeNull();
  });

  it('normalizes Douyin featured URLs and share text consistently', () => {
    const url = 'https://v.douyin.com/abc123/';
    expect(normalizeVideoSourceUrl(`分享视频 ${url} 复制打开抖音`)).toBe(url);
    expect(supportedVideoSourcePlatform(`分享视频 ${url} 复制打开抖音`)).toBe('douyin');
    expect(videoSourceIdentity(`分享视频 ${url} 复制打开抖音`)).toBe(videoSourceIdentity(url));
    const featured = 'https://www.douyin.com/jingxuan?modal_id=123';
    expect(normalizeVideoSourceUrl(featured)).toBe('https://www.douyin.com/video/123');
    expect(videoSourceIdentity(featured)).toBe(videoSourceIdentity('https://www.douyin.com/video/123'));
  });

  it.each([
    'https://www.douyin.com/jingxuan/search/qianjidong?aid=2052a92f-0793-47c1-b739-c0af829b6103&modal_id=7693859410975690010&type=general',
    'https://douyin.com/jingxuan/search/%E6%97%85%E8%A1%8C/?modal_id=7693859410975690010',
    'https://www.douyin.com/jingxuan/search?modal_id=7693859410975690010'
  ])('normalizes a selected Douyin search result and identifies the same video: %s', url => {
    const videoUrl = 'https://www.douyin.com/video/7693859410975690010';
    expect(normalizeVideoSourceUrl(url)).toBe(videoUrl);
    expect(supportedVideoSourcePlatform(url)).toBe('douyin');
    expect(videoSourceIdentity(url)).toBe(videoSourceIdentity(videoUrl));
    expect(videoSourceIdentity(url.replace('7693859410975690010', '7693859410975690011')))
      .not.toBe(videoSourceIdentity(url));
  });

  it.each([
    'https://www.tiktok.com/@creator', 'https://www.instagram.com/creator/',
    'https://www.douyin.com/user/123', 'https://www.facebook.com/creator/',
    'https://www.douyin.com/jingxuan/search/qianjidong?type=general',
    'https://www.douyin.com/jingxuan/search/qianjidong?modal_id=abc',
    'https://www.douyin.com/jingxuan/search/qianjidong/extra?modal_id=123',
    'https://notdouyin.com/jingxuan/search/qianjidong?modal_id=123',
    'https://www.douyin.com/jingxuanother?modal_id=123',
    'https://www.xiaohongshu.com/user/profile/123', 'https://www.pinterest.com/creator/',
    'https://notpinterest.com/pin/123/', 'https://instagram.com.example.com/reel/abc/',
    'http://www.instagram.com/reel/abc/', 'file:///tmp/video.mp4', 'not a URL'
  ])('rejects unsupported links: %s', url => {
    expect(supportedVideoSourcePlatform(url)).toBeNull();
    expect(videoSourceIdentity(url)).toBeNull();
  });

  it('preserves signed note parameters and never reuses a different note', () => {
    const url = 'https://www.xiaohongshu.com/explore/6a9149f3000000001f01d20a?xsec_token=sample%3D&xsec_source=pc_feed';
    expect(normalizeVideoSourceUrl(url)).toBe(url);
    expect(videoSourceIdentity(url)).not.toBe(videoSourceIdentity(url.replace('1f01d20a', '1f01d20b')));
  });
});
