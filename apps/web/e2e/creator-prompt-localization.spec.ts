import type { CreatorJob, CreatorPresetListResponse } from '@opencreator/protocol';
import { test, expect } from './fixtures/runtime.js';

test('模板提示词在 Browser/Desktop Bridge 下按语言显示并完整带入任务', async ({ browser, runtime }, testInfo) => {
  const results: unknown[] = [];
  for (const platform of ['browser', 'desktop'] as const) {
    const context = await browser.newContext({
      viewport: testInfo.project.use.viewport,
      locale: 'en-US',
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    if (platform === 'desktop') {
      await page.addInitScript(() => {
        const success = { ok: true as const };
        Object.defineProperty(window, 'opencreatorDesktop', {
          configurable: true,
          value: {
            kind: 'desktop',
            readAppVersion: async () => '3.2.2',
            readConnectionConfig: async () => ({ baseUrl: '/.opencreator/runtime' }),
            subscribeConnectionConfig: () => () => undefined,
            restartRuntime: async () => success,
            selectCodexPath: async () => success,
            reloadWorkspace: async () => success,
            workspaceReady: () => undefined,
            readDesktopPreferences: async () => ({ closeBehavior: 'hide' }),
            updateDesktopPreferences: async () => ({ closeBehavior: 'hide' }),
            selectProjectDirectory: async () => null,
            resolveDroppedFilePath: () => null,
            openExternal: async () => undefined,
            revealPath: async () => success,
            notify: async () => undefined,
            configureBackgroundNotifications: async () => success,
            subscribeNavigation: () => () => undefined
          }
        });
      });
    }
    try {
      await runtime.api('PATCH', '/settings/ui', { language: 'zh-CN' });
      await runtime.openApp(page);
      await page.goto(`${runtime.origin}/#/new`);
      await page.getByRole('tab', { name: '视频创作', exact: true }).click();
      await page.getByRole('button', { name: '查看纽约跑酷与蛛丝摆荡动作模板详情' }).click();
      const zhCatalog = await runtime.api<CreatorPresetListResponse>('GET', '/creator/presets?locale=zh-CN');
      const chinese = zhCatalog.presets.find(preset => preset.id === 'nyc-parkour-web-swing')!;
      await expect(page.locator('.creator-template-prompt-card')).toHaveText(chinese.prompt!);

      await runtime.api('PATCH', '/settings/ui', { language: 'en-US' });
      await page.reload();
      await page.getByRole('tab', { name: 'Video Creation', exact: true }).click();
      await page.getByRole('button', { name: 'View NYC Parkour and Web-Swing Action template details' }).click();
      const enCatalog = await runtime.api<CreatorPresetListResponse>('GET', '/creator/presets?locale=en-US');
      const english = enCatalog.presets.find(preset => preset.id === chinese.id)!;
      expect(english.prompt!.length).toBeGreaterThan(4000);
      expect(english.prompt).not.toBe(chinese.prompt);
      await expect(page.locator('.creator-template-prompt-card')).toHaveText(english.prompt!);
      await page.screenshot({ path: testInfo.outputPath(`${platform}-english-template.png`), fullPage: true });
      const promptBox = await page.locator('.creator-template-prompt-card').boundingBox();
      await page.getByRole('button', { name: 'Use this template', exact: true }).click();
      await expect(page).toHaveURL(/#\/workbench\?tool=video-generation&jobId=/);
      const jobId = new URL(new URL(page.url()).hash.slice(1), runtime.origin).searchParams.get('jobId')!;
      const { job } = await runtime.api<{ job: CreatorJob }>('GET', `/creator/jobs/${jobId}`);
      await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveValue(english.prompt!);
      await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toHaveAttribute('maxlength', '16000');
      expect(job.state.prompt).toBe(english.prompt);
      expect(job.presetOrigin?.locale).toBe('en-US');
      results.push({
        chinese: chinese.prompt,
        english: english.prompt,
        width: Math.round(promptBox!.width),
        state: job.state,
        origin: job.presetOrigin
      });
    } finally {
      await context.close();
    }
  }
  expect(results[1]).toEqual(results[0]);
});
