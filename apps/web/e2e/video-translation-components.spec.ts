import type { CreatorJob, CreatorRuntimeComponentsResponse } from '@opencreator/protocol';
import { expect, test } from './fixtures/runtime.js';

test('本地转录提示可跳转下载、显示真实进度并返回原视频翻译草稿', async ({ page, runtime }) => {
  const status: CreatorRuntimeComponentsResponse = {
    platform: 'darwin', arch: 'arm64', selectedProvider: 'whisperkit', selectedModel: 'large-v2',
    components: [{ id: 'whisperkit', name: 'WhisperKit', available: true, version: null, supportedVersion: '1.1.0', installedAt: null,
      path: '/runtime/dependencies', source: 'Homebrew / ModelScope', models: [{ id: 'large-v2', installed: false, bytes: null }],
      state: 'not_installed', model: 'large-v2', item: null, downloadedBytes: 0, totalBytes: null, percent: null, bytesPerSecond: null, remainingSeconds: null, error: null }]
  };
  let downloadRequests = 0;
  await page.route('**/creator/components/status', route => route.fulfill({ json: status }));
  await page.route('**/creator/components/download', route => {
    downloadRequests += 1;
    Object.assign(status.components[0]!, { state: 'downloading', item: 'WhisperKit large-v2 model', downloadedBytes: 1024 ** 3, totalBytes: 2 * 1024 ** 3, percent: 50, bytesPerSecond: 1024 ** 2 });
    return route.fulfill({ json: status });
  });
  await page.route('**/creator/yt-dlp/check', route => route.fulfill({ json: { ytDlp: { channel: 'nightly', source: 'bundled', currentVersion: 'test', bundledVersion: 'test', latestVersion: 'next', updateAvailable: true, checkDue: false, lastCheckedAt: null, lastCheckAttemptAt: null, installedAt: null } } }));
  await page.route('**/video-metadata?*', route => route.fulfill({ json: { platform: 'youtube', title: 'Component test', width: 1920, height: 1080 } }));
  const job = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId, templateId: 'video-translation', templateVersion: 2,
    state: { sourceType: 'url', sourceUrl: 'https://www.youtube.com/watch?v=component-test', sourceLanguage: 'en', targetLanguage: 'zh_cn', currentStep: 1, furthestStep: 1, workspacePhase: 'configure' },
    creationKey: 'component-notice'
  }).then(response => response.job);
  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-translation&jobId=${encodeURIComponent(job.id)}`);
  await expect(page.getByText('本地转录组件尚未就绪')).toBeVisible();
  await expect(page.getByText(/没有可用字幕时才需要本地转录/)).toBeVisible();
  await page.getByRole('link', { name: '前往组件下载' }).click();
  await expect(page.getByRole('heading', { name: '第三方组件' })).toBeVisible();
  await page.getByRole('button', { name: '下载组件' }).click();
  await expect(page.getByRole('progressbar', { name: '组件下载进度' })).toHaveAttribute('value', '50');
  await expect(page.getByText(/当前尚未开始转录/)).toBeVisible();
  Object.assign(status.components[0]!, { state: 'ready', version: '1.1.0', percent: 100 });
  status.components[0]!.models[0]!.installed = true;
  const component = page.locator('#component-whisperkit');
  const checkStatus = component.getByRole('button', { name: '检查状态' });
  await expect(checkStatus).toBeVisible();
  await expect(component.locator('.settings-primary-button')).toHaveCount(0);
  await expect(component.getByText('/runtime/dependencies')).toBeHidden();
  await checkStatus.click();
  await expect(component.getByText('检查完成，本地组件已就绪。')).toBeVisible();
  expect(downloadRequests).toBe(1);
  await component.getByText('组件详情', { exact: true }).click();
  await expect(component.getByText('/runtime/dependencies')).toBeVisible();
  await component.getByText('组件详情', { exact: true }).click();
  const ytDlp = page.locator('.runtime-component-item').filter({ has: page.getByRole('heading', { name: 'yt-dlp nightly' }) });
  await expect(ytDlp.getByRole('button', { name: '更新到 next' })).toBeVisible();
  const controls = await page.evaluate(() => {
    const localCard = document.querySelector('#component-whisperkit')!;
    const localButton = localCard.querySelector('button')!.getBoundingClientRect();
    const ytDlpButtons = document.querySelectorAll('.runtime-component-item:not(.local-component-item) .runtime-component-actions button');
    const check = ytDlpButtons[0]!.getBoundingClientRect();
    const update = ytDlpButtons[1]!.getBoundingClientRect();
    return { localWidth: localButton.width, localHeight: localButton.height, cardWidth: localCard.getBoundingClientRect().width,
      checkWidth: check.width, checkHeight: check.height, checkTop: check.top, updateLeft: update.left, checkRight: check.right, updateTop: update.top };
  });
  expect(controls.localWidth).toBeLessThan(200);
  expect(controls.localWidth).toBeLessThan(controls.cardWidth / 2);
  expect(controls.localHeight).toBeGreaterThanOrEqual(32);
  expect(controls.localHeight).toBeLessThanOrEqual(36);
  expect(controls.checkHeight).toBe(controls.localHeight);
  expect(Math.abs(controls.checkTop - controls.updateTop)).toBeLessThan(1);
  expect(controls.updateLeft - controls.checkRight).toBeGreaterThanOrEqual(7);
  await page.screenshot({ path: 'test-results/video-translation-components-compact.png', fullPage: true });
  await page.getByRole('button', { name: '返回视频翻译' }).click();
  await expect(page).toHaveURL(new RegExp(`jobId=${job.id}`));
  await expect(page.getByText('本地转录已就绪')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '翻译流程' }).getByRole('button', { name: /翻译设置$/ })).toHaveAttribute('aria-current', 'step');
});
