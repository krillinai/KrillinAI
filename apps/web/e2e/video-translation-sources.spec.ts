import type { CreatorJob } from '@opencreator/protocol';
import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures/runtime.js';

test('视频翻译显示全部下载来源并接受抖音分享文本', async ({ page, runtime }, testInfo) => {
  await page.route('**/video-metadata?*', route => route.fulfill({ json: { platform: 'douyin', title: 'Douyin video' } }));
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId,
    templateId: 'video-translation',
    templateVersion: 2,
    state: {},
    creationKey: 'translation-platforms'
  });
  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-translation&jobId=${encodeURIComponent(job.id)}`);
  const platforms = page.getByRole('list', { name: '支持的平台' });
  await expect(platforms.locator('li')).toHaveCount(9);
  await expect.poll(() => platforms.locator('img').evaluateAll(images => images.every(image => (
    (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
  )))).toBe(true);
  const urlField = page.getByRole('textbox', { name: '视频链接' });
  const sourceRow = page.locator('.video-source-platforms-compact');
  const inputBounds = await urlField.locator('..').boundingBox();
  const sourceBounds = await sourceRow.boundingBox();
  expect(inputBounds).not.toBeNull();
  expect(sourceBounds).not.toBeNull();
  expect(sourceBounds!.x).toBeCloseTo(inputBounds!.x, 0);
  expect(sourceBounds!.width).toBeCloseTo(inputBounds!.width, 0);
  expect(sourceBounds!.y).toBeGreaterThan(inputBounds!.y + inputBounds!.height);
  expect(await platforms.locator('img').first().evaluate(image => image.getBoundingClientRect().width)).toBe(20);
  const pinterest = platforms.getByRole('img', { name: 'Pinterest', exact: true });
  await pinterest.hover();
  await expect(platforms.getByRole('tooltip', { name: 'Pinterest', exact: true })).toBeVisible();
  await urlField.hover();
  await expect(platforms.getByRole('tooltip', { name: 'Pinterest', exact: true })).toBeHidden();
  await pinterest.focus();
  await expect(platforms.getByRole('tooltip', { name: 'Pinterest', exact: true })).toBeVisible();
  await pinterest.press('Escape');
  await expect(platforms.getByRole('tooltip', { name: 'Pinterest', exact: true })).toBeHidden();
  await urlField.focus();
  expect(await platforms.evaluate(list => {
    const bounds = list.getBoundingClientRect();
    return [...list.querySelectorAll('li')].every(item => {
      const rect = item.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right;
    });
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('translation-sources.png'), fullPage: true });
  const url = 'https://v.douyin.com/abc123/';
  await urlField.fill(`分享视频 ${url} 复制打开抖音`);
  await expect(page.getByRole('link', { name: '打开原始链接' })).toHaveAttribute('href', url);
  await expect(page.getByRole('button', { name: '下载并预览' })).toBeEnabled();
  const originalLink = page.getByRole('link', { name: '打开原始链接' });
  const mediaBounds = await page.locator('.video-source-preview-media').boundingBox();
  const originalBounds = await originalLink.boundingBox();
  expect(originalBounds!.y + originalBounds!.height).toBeLessThan(mediaBounds!.y + mediaBounds!.height);
  await expect(page.getByText('此平台暂不支持内嵌预览')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('translation-source-preview.png'), fullPage: true });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('heading', { name: '设置翻译语言' })).toBeVisible();
  await expect.poll(async () => runtime.api<{ job: CreatorJob }>('GET', `/creator/jobs/${job.id}`)
    .then(result => result.job.state.sourceUrl)).toBe(url);
});

test('视频来源优先在线播放且不会启动下载阶段', async ({ page, runtime }, testInfo) => {
  const media = readFileSync(new URL('./fixtures/online-preview.mp4', import.meta.url));
  await page.route('**/video-metadata?*', route => route.fulfill({ json: {
    platform: 'douyin', title: 'Douyin online preview', previewUrl: 'https://media.example.test/preview.mp4', width: 96, height: 160
  } }));
  await page.route('https://media.example.test/preview.mp4', route => route.fulfill({ contentType: 'video/mp4', body: media }));
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId, templateId: 'video-translation', templateVersion: 2,
    state: { sourceType: 'url', sourceUrl: 'https://v.douyin.com/online/' }, creationKey: 'translation-online-preview'
  });
  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-translation&jobId=${encodeURIComponent(job.id)}`);
  const video = page.getByLabel('在线视频预览');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate(element => (element as HTMLVideoElement).play());
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
  await video.evaluate(element => (element as HTMLVideoElement).pause());
  await expect(page.getByRole('button', { name: '下载并预览' })).toHaveCount(0);
  const saved = await runtime.api<{ job: CreatorJob }>('GET', `/creator/jobs/${job.id}`);
  expect(saved.job.stages).toHaveLength(0);
  expect(saved.job.artifacts).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('translation-online-preview.png'), fullPage: true });
});
