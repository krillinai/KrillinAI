import { test, expect } from './fixtures/runtime.js';
import type { CreatorJob, GatewayAccountState } from '@opencreator/protocol';

test('official video references and integer quote fit the workspace', async ({ page, runtime }, testInfo) => {
  const model = { id: 'seedance-2.5官方版', modality: 'video' as const, name: 'Seedance 2.5', capabilities: ['generate', 'image_to_video'], status: 'ready' as const,
    durations: [4, 8, 15, 30], resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'],
    price: { version: 'video-v1', videoUnitsPerSecond: { '720p': 200_000_000 } },
    videoOptions: { profile: 'seedance', maxImages: 30, maxVideos: 10, maxAudios: 10, firstLastFrames: true, framesExclusive: true, generateAudio: false, referenceDuration: 0 } };
  const state: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'video-test', email: 'video@example.test', verified: true },
    bindingVersion: 'video:1', selectedModels: { video: model.id }, models: [model], activationError: null };
  await page.route('**/gateway/account', route => route.fulfill({ json: state }));
  await page.route('**/gateway/billing/summary', route => route.fulfill({ json: { balance: { availableUnits: '1000000000', reservedUnits: '0', periodEnd: null, asOf: '2026-10-15T00:00:00Z' }, subscription: null, billingAvailable: false } }));
  await page.addInitScript(() => localStorage.setItem('opencreator.agent-setup-confirmed.v1', '1'));
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId, templateId: 'video-generation', state: { officialModels: { video: model.id }, prompt: '海边的一段连续镜头', provider: 'seedance', size: '720p@16:9', duration: 4, currentStep: 1, furthestStep: 1 }
  });
  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-generation&jobId=${job.id}`);
  await expect(page.getByLabel('视频模型')).toBeVisible();
  await expect(page.getByText(/800 积分/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('official-video-settings.png'), fullPage: true });
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await expect(page.getByLabel('上传参考图片')).toBeAttached();
  await page.getByRole('button', { name: '首尾帧', exact: true }).click();
  await expect(page.getByLabel('上传首帧')).toBeAttached();
  await page.getByRole('button', { name: '参考素材', exact: true }).click();
  await expect(page.getByLabel('上传参考视频')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const overlap = await page.locator('.video-generation-settings-grid label').evaluateAll(elements => elements.some(element => element.scrollWidth > element.clientWidth + 1));
  expect(overlap).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('official-video.png'), fullPage: true });
});
