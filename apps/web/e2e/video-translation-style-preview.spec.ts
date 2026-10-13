import type { CreatorJob } from '@opencreator/protocol';
import { expect, test } from './fixtures/runtime.js';

const poster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/B2kAAAAASUVORK5CYII=',
  'base64'
);

test('字幕样式预览显示视频封面并按源比例或竖屏输出比例排版', async ({ page, runtime }, testInfo) => {
  await page.route('**/video-metadata?*', route => route.fulfill({
    json: {
      platform: 'bilibili',
      title: '4:3 source',
      thumbnailUrl: 'https://images.example.test/source.png',
      width: 1024,
      height: 768
    }
  }));
  await page.route('https://images.example.test/source.png', route => route.fulfill({
    body: poster,
    contentType: 'image/png'
  }));
  const job = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId,
    templateId: 'video-translation',
    templateVersion: 1,
    state: {
      sourceType: 'url',
      sourceUrl: 'https://www.bilibili.com/video/BV1abc123',
      sourceLanguage: 'en',
      targetLanguage: 'zh_cn',
      currentStep: 2,
      furthestStep: 2,
      composeVideo: true,
      workspacePhase: 'configure'
    },
    creationKey: 'style-preview-ratio'
  }).then(response => response.job);

  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-translation&jobId=${encodeURIComponent(job.id)}`);
  const preview = page.getByRole('region', { name: '字幕样式预览' });
  const image = preview.locator('img.video-translation-subtitle-preview-media');
  const frame = preview.locator(':scope > div');
  const settings = page.locator('.video-translation-wizard-main .video-translation-wizard-body');
  const subtitles = preview.locator('img.video-translation-subtitle-rendered-preview');
  await expect(preview).toHaveAttribute('data-ratio', '4:3');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(subtitles).toBeVisible();
  await expect.poll(() => subtitles.evaluate(element => {
    const img = element as HTMLImageElement;
    if (!img.complete || img.naturalWidth === 0) return 0;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let offset = 3; offset < rgba.length; offset += 4) if (rgba[offset]! > 0) painted++;
    return painted;
  })).toBeGreaterThan(100);
  const initialSource = await subtitles.getAttribute('src');
  await page.getByRole('combobox', { name: '字幕字体' }).selectOption('serif');
  await expect.poll(() => subtitles.getAttribute('src')).not.toBe(initialSource);
  await expect.poll(() => subtitles.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(960);
  await expect.poll(() => subtitles.evaluate(element => (element as HTMLImageElement).naturalHeight)).toBe(720);
  const initialBox = await frame.boundingBox();
  expect(initialBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await preview.screenshot({ path: testInfo.outputPath('subtitle-style-preview.png') });
  await page.screenshot({ path: testInfo.outputPath('subtitle-style-source.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect.poll(() => settings.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(720);
  expect(await frame.evaluate(element => {
    const overlay = getComputedStyle(element, '::after');
    const cues = element.querySelector('.video-translation-subtitle-rendered-preview, .video-translation-subtitle-preview-status');
    return {
      background: overlay.backgroundColor,
      overlayLayer: overlay.zIndex,
      cueLayer: cues === null ? '' : getComputedStyle(cues).zIndex
    };
  })).toEqual({ background: 'rgba(0, 0, 0, 0.55)', overlayLayer: '1', cueLayer: '2' });
  const sourceBox = await frame.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(sourceBox!.width / sourceBox!.height).toBeCloseTo(4 / 3, 1);
  await page.screenshot({ path: test.info().outputPath('video-subtitle-settings-wide.png'), fullPage: true });

  await page.setViewportSize({ width: 1100, height: 800 });
  expect(await settings.evaluate(element => {
    const container = element.closest('.video-translation-wizard-main');
    return container !== null && element.getBoundingClientRect().width <= container.getBoundingClientRect().width;
  })).toBe(true);

  await page.getByRole('combobox', { name: '输出画幅' }).selectOption('vertical');
  await expect(preview).toHaveAttribute('data-ratio', '9:16');
  await expect(preview).toHaveAttribute('data-converted', 'true');
  await expect(subtitles).toBeVisible();
  await expect.poll(() => subtitles.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(540);
  await expect.poll(() => subtitles.evaluate(element => (element as HTMLImageElement).naturalHeight)).toBe(960);
  const verticalBox = await frame.boundingBox();
  expect(verticalBox).not.toBeNull();
  expect(verticalBox!.width / verticalBox!.height).toBeCloseTo(9 / 16, 1);
  await page.screenshot({ path: test.info().outputPath('video-subtitle-settings-narrow.png'), fullPage: true });
});
