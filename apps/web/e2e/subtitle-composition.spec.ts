import type { CreatorArtifact, CreatorJob } from '@opencreator/protocol';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, test } from './fixtures/runtime.js';

test('已有成片时深度编辑仍渲染双语字幕，播放拖动和全屏无需重新编译', async ({ page, runtime }, testInfo) => {
  const sourceVideo = testInfo.outputPath('source.mp4');
  execFileSync(resolve('apps/desktop/.pack/creator-runtime/krillinai/bin/ffmpeg'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x202020:s=640x360:d=2:r=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourceVideo]);
  const { job } = await runtime.api<{ job: CreatorJob }>('POST', '/creator/jobs', {
    projectId: runtime.projectId, templateId: 'video-translation', templateVersion: 2,
    creationKey: 'subtitle-composition', state: { sourceType: 'url', sourceUrl: 'https://www.youtube.com/watch?v=subtitle-local-test',
      sourceLanguage: 'en', targetLanguage: 'zh_cn', composeVideo: true, bilingual: true, subtitlePosition: 'top', workspacePhase: 'result', resultVersion: 1 }
  });
  const cue = (id: number, text: string) => ({ id, start: id === 1 ? '00:00:00,200' : '00:00:01,000', end: id === 1 ? '00:00:00,800' : '00:00:01,800', text });
  const make = (id: string, kind: string, metadata: CreatorArtifact['metadata']): CreatorArtifact => ({
    id, jobId: job.id, kind, version: 1, status: 'completed', path: null, scopeKey: null, inputFingerprint: null, sha256: null,
    sourceArtifactIds: [], createdAt: job.createdAt, metadata: { ...metadata, resultVersion: 1, settingsSnapshot: job.state }
  });
  const source = make('source-video', 'source_video', { fileName: 'local.mp4', width: 640, height: 360 });
  const rendered = make('rendered-video', 'horizontal_video', { fileName: 'old-single-language.mp4', width: 640, height: 360 });
  const original = make('original-srt', 'source_subtitle', { cues: [cue(1, 'Full original sentence, '.repeat(9)), cue(2, 'Second source sentence.')] });
  const target = make('target-srt', 'target_subtitle', { cues: [cue(1, '第一条，保留标点！\n保留手动换行。'), cue(2, '第二条字幕，柔和阴影也要清晰。')] });
  const completed: CreatorJob = { ...job, status: 'completed', artifacts: [source, original, target, rendered], state: { ...job.state,
    resultSnapshots: [{ version: 1, createdAt: job.createdAt, action: 'stage-succeeded', stageId: 'subtitle', description: '字幕翻译',
      artifactRefs: { source_video: [source.id], source_subtitle: [original.id], target_subtitle: [target.id], horizontal_video: [rendered.id] },
      changedArtifactIds: [target.id], staleArtifactIds: [], state: job.state }] } };
  await page.route(`**/creator/jobs/${job.id}`, route => route.request().method() === 'GET' ? route.fulfill({ json: { job: completed } }) : route.continue());
  await page.route(`**/creator/jobs/${job.id}/actions`, route => {
    const request = route.request().postDataJSON();
    completed.state = { ...completed.state, ...request.input?.patch };
    completed.revision++;
    return route.fulfill({ json: { job: completed, receipt: { actor: 'user', action: request.action, summary: '更新设置',
      affectedArtifacts: [], newRevision: completed.revision, createdAt: job.createdAt } } });
  });
  await page.route(`**/creator/jobs/${job.id}/artifacts/${source.id}/content`, route => route.fulfill({ contentType: 'video/mp4',
    body: readFileSync(sourceVideo) }));
  await page.route(`**/creator/jobs/${job.id}/artifacts/${rendered.id}/content`, route => route.fulfill({ contentType: 'video/mp4',
    body: readFileSync(sourceVideo) }));
  await page.route('**/video-metadata?*', route => route.fulfill({ json: { platform: 'youtube', title: 'Local subtitle test', width: 640, height: 360 } }));
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/B2kAAAAASUVORK5CYII=', 'base64') }));
  const compilations: Array<{ bilingual: boolean; cues: Array<{ text: string; sourceText?: string }> }> = [];
  page.on('request', request => { if (request.url().endsWith('/creator/subtitle-render/prepare')) compilations.push(request.postDataJSON()); });
  await runtime.openApp(page);
  await page.goto(`${runtime.origin}/#/workbench?tool=video-translation&jobId=${job.id}`);
  // The outputs tab plays the saved video; subtitle editing uses live composition.
  await expect(page.getByLabel('横屏成片预览')).toBeVisible();
  const renderedSrc = await page.getByLabel('横屏成片预览').getAttribute('src');
  await page.getByRole('button', { name: '深度编辑', exact: true }).click();
  const composition = page.locator('.video-result-workspace .subtitle-composition-preview');
  await expect(composition).toHaveAttribute('data-status', 'ready');
  const video = page.getByLabel('横屏字幕视频预览');
  const sourceSrc = await video.getAttribute('src');
  expect(sourceSrc).not.toBe(renderedSrc);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth)).toBe(640);
  await expect.poll(() => compilations.at(-1)?.cues.length).toBe(2);
  expect(compilations.at(-1)!.bilingual).toBe(true);
  expect(compilations.at(-1)!.cues[0]!.sourceText!.length).toBeGreaterThan(128);
  expect(compilations.at(-1)!.cues[0]!.text).toContain('\n');
  const count = compilations.length;
  const hash = await composition.getAttribute('data-render-hash');
  await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 0.5; });
  await page.waitForTimeout(150);
  await composition.screenshot({ path: testInfo.outputPath('saved-bilingual-preview.png') });
  await page.getByRole('button', { name: '字幕样式', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(video).toHaveAttribute('src', sourceSrc!);
  await expect(composition).toHaveAttribute('data-status', 'ready');
  expect(compilations.length).toBe(count);
  const editorCount = compilations.length;
  await video.evaluate(async element => { const video = element as HTMLVideoElement; video.playbackRate = 2; await video.play(); });
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(1.1);
  await video.evaluate(element => (element as HTMLVideoElement).pause());
  await expect(composition).toHaveAttribute('data-render-hash', hash!);
  expect(compilations.length).toBe(editorCount);
  await page.getByRole('button', { name: '全屏预览', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('video-result-player-frame');
  await expect(composition.locator('canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fullscreen.png') });
  await page.evaluate(() => document.exitFullscreen());
  // Changing the style while paused must render readable glyphs, not merely
  // report a ready canvas containing a blurred, almost invisible text mask.
  await video.evaluate(element => { (element as HTMLVideoElement).currentTime = 1.2; });
  await page.getByRole('button', { name: '字幕样式', exact: true }).click();
  await page.getByRole('radio', { name: '柔和阴影', exact: true }).click();
  await expect(composition).not.toHaveAttribute('data-render-hash', hash!);
  await expect(composition).toHaveAttribute('data-status', 'ready');
  await expect.poll(() => composition.locator('canvas').evaluate(canvas => {
    const image = document.createElement('canvas');
    image.width = canvas.width; image.height = canvas.height;
    const context = image.getContext('2d')!;
    context.drawImage(canvas, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let sharpGlyphs = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 180 && pixels[i + 3]! > 250) sharpGlyphs++;
    return sharpGlyphs;
  })).toBeGreaterThan(200);
  await composition.screenshot({ path: testInfo.outputPath('soft-shadow-paused.png') });
  await page.getByRole('button', { name: '返回项目', exact: true }).click();
  await expect(page.getByLabel('横屏成片预览')).toHaveAttribute('src', renderedSrc!);
});
