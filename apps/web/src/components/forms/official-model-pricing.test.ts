import { expect, it } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { officialModelPrice, officialModelPriceDescription } from './official-model-pricing.js';

const zh = (value: string) => value;
const en = (_: string, value: string) => value;
const model = (modality: GatewayModel['modality'], price: NonNullable<GatewayModel['price']>, extra: Partial<GatewayModel> = {}): GatewayModel => ({ id: 'test', modality, capabilities: [], price, ...extra });
const video = model('video', { version: 'v1', videoUnitsPerSecond: { '480p': 10_000_000, '720p': 37_354_133, '1080p': 44_824_959 } }, { durations: [4, 6, 8], resolutions: ['480p', '720p', '1080p'], aspectRatios: ['9:16', '16:9'] });

it.each([
  [model('text', { version: 'v1', inputPerMillion: 2091.831996, outputPerMillion: 10459.15998 }), '输入 2092 / 输出 10459 积分/百万 token', 'Input 2092 / output 10459 credits/M tokens'],
  [model('text', { version: 'v1', inputPerMillion: 119.533223, outputPerMillion: 478.132891 }), '输入 120 / 输出 478 积分/百万 token', 'Input 120 / output 478 credits/M tokens'],
  [model('image', { version: 'v1', billing: 'usage', inputPerMillion: 5229.57999, imageInputPerMillion: 10459.15998, outputPerMillion: 31377.47994 }), '约 64 积分/张', 'About 64 credits / image'],
  [model('image', { version: 'legacy', perRequest: 10 }), '约 10 积分/张', 'About 10 credits / image'],
  [model('speech', { version: 'v1', perMillionCharacters: 15688.735488 }), '约 16 积分/千字符', 'About 16 credits / 1,000 characters'],
  [model('speech', { version: 'v1', perMillionCharacters: 31377.470976 }), '约 31 积分/千字符', 'About 31 credits / 1,000 characters'],
  [model('speech', { version: 'legacy', perMinute: 20, perMillionCharacters: 4000 }), '约 21 积分/分钟', 'About 21 credits / minute'],
  [model('transcription', { version: 'v1', perMinute: 6.275494 }), '约 6 积分/分钟', 'About 6 credits / minute'],
  [video, '约 37 积分/秒 · 720p', 'About 37 credits/second · 720p'],
] as const)('uses the requested billing unit for %j', (value, chinese, english) => {
  expect(officialModelPrice(value, zh)).toBe(chinese);
  expect(officialModelPrice(value, en)).toBe(english);
});

it('quotes each video second at a supported resolution independently of clip duration', () => {
  expect(officialModelPriceDescription(video, zh)).toContain('720p：约 37 积分/秒');
  const fallback = { ...video, durations: [4, 6], resolutions: ['1080p'], aspectRatios: ['9:16'] };
  expect(officialModelPrice(fallback, zh)).toBe('约 45 积分/秒 · 1080p');
  expect(officialModelPriceDescription(fallback, zh)).toContain('1080p：约 45 积分/秒');
  expect(officialModelPrice({ ...video, durations: [] }, zh)).toBe(officialModelPrice(video, zh));
});

it('retains the workload assumptions and actual tariffs in price descriptions', () => {
  const text = model('text', { version: 'v1', inputPerMillion: 2091.83, cachedInputPerMillion: 104.59, cacheWritePerMillion: 2614.79, outputPerMillion: 10459.16 });
  expect(officialModelPriceDescription(text, zh)).toContain('按上游实际输入、输出');
  expect(officialModelPriceDescription(text, zh)).toContain('缓存输入 105');
  expect(officialModelPriceDescription(text, zh)).toContain('缓存写入 2615');
  expect(officialModelPriceDescription(model('transcription', { version: 'v1', perMinute: 6.275494 }), zh)).toContain('不足一分钟按比例扣积分');
});

it('does not present audio-only estimates for token-priced speech', () => {
  const speech = model('speech', { version: 'v1', inputPerMillion: 14343.986732, perMinute: 17.929983 });
  expect(officialModelPrice(speech, zh)).toBe('暂无法估算');
  expect(officialModelPriceDescription(speech, zh)).toContain('文本输入 14344 积分/百万 token + 18 积分/分钟');
});

it('keeps integer rates and never substitutes a fixed text call or video clip price', () => {
  expect(officialModelPrice(model('text', { version: 'v1', inputPerMillion: 1499.9996, outputPerMillion: 0.0001 }), zh)).toBe('输入 1500 / 输出 <1 积分/百万 token');
  expect(officialModelPrice(model('text', { version: 'v1', inputPerMillion: 150, outputPerMillion: 600 }), zh)).toBe('输入 150 / 输出 600 积分/百万 token');
  expect(officialModelPrice(video, zh)).not.toContain('积分/段');
});

it('does not guess missing or invalid model prices', () => {
  expect(officialModelPrice({ ...video, price: undefined }, zh)).toBe('');
  for (const value of [model('image', { version: 'v1', billing: 'usage', outputPerMillion: 100 }), model('speech', { version: 'v1', perMillionCharacters: NaN })]) {
    expect(officialModelPrice(value, zh)).toBe('暂无法估算');
  }
  expect(officialModelPrice({ ...video, resolutions: [] }, zh)).toBe('价格暂不可用');
});
