import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  readCreatorResultSnapshots,
  type CreatorArtifact,
  type CreatorJob,
  type CreatorJson,
  type CreatorStageRun
} from '@opencreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { appLanguageOptions } from '../../i18n/language.js';
import { createLocalizedCopy } from '../../i18n/localized-copy.js';
import { CreatorSessionProvider, useCreatorSession } from './creator-session-store.js';
import VideoTranslationWorkspace from './VideoTranslationWorkspace.js';
import { LanguageSwitchControls } from '../../test/LanguageSwitchControls.js';

describe('VideoTranslationWorkspace task controls', () => {
  it.each([false, true])('opens and returns to outputs when composeVideo is %s without automatically rendering', async composeVideo => {
    const target = subtitleArtifact(1, 'Hello world');
    const initialJob = job({ status: 'completed', revision: 1, stages: [], artifacts: [target], state: {
      composeVideo, resultTab: 'subtitles', workspacePhase: 'result', resultVersion: 1
    } });
    const applyAction = vi.fn(async (_id: string, _request: { action: string }) => ({ job: initialJob }));
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={initialJob}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    expect(await screen.findByRole('tab', { name: '作品' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('textbox', { name: '横屏字幕 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '深度编辑' }));
    expect(await screen.findByRole('button', { name: '返回项目' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '返回项目' }));
    expect(screen.getByRole('tab', { name: '作品' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('target-subtitle-v1.srt')).toBeVisible();
    expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
  });

  it('shares immersive style and voice settings with configuration and only regenerates after confirmation', async () => {
    const target = subtitleArtifact(1, 'Hello world');
    let current = job({ status: 'completed', revision: 1, stages: [], artifacts: [target], state: {
      workspacePhase: 'result', resultVersion: 1, composeVideo: true, dubbing: false,
      ttsProvider: 'openai', ttsModel: 'gpt-4o-mini-tts', voiceCode: 'alloy', voiceName: 'Alloy'
    } });
    current.state.resultSnapshots = [{ version: 1, createdAt: target.createdAt, action: 'run-stage', stageId: 'subtitle',
      description: 'Subtitles', artifactRefs: { target_subtitle: [target.id] }, changedArtifactIds: [target.id], staleArtifactIds: [], state: { ...current.state } }];
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    const services = {
      getConfig: vi.fn(async () => ({ config: { tts: { provider: 'openai', openai: { model: 'gpt-4o-mini-tts', defaultVoiceId: 'alloy' } } } })),
      getTtsVoices: vi.fn(async () => ({ voices: [
        { id: 'alloy', name: 'Alloy', provider: 'openai', kind: 'builtin' },
        { id: 'echo', name: 'Echo', provider: 'openai', kind: 'builtin' }
      ] })),
      previewTtsVoice: vi.fn()
    };
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} creatorServicesService={services as never} />
    </CreatorSessionProvider></LanguageProvider>);
    fireEvent.click(await screen.findByRole('tab', { name: '字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '深度编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '字幕样式' }));
    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    fireEvent.change(screen.getByRole('combobox', { name: '字幕字体' }), { target: { value: 'serif' } });
    fireEvent.change(screen.getByRole('combobox', { name: '字幕大小' }), { target: { value: 'large' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: '自定义字幕样式' })).getByRole('button', { name: '完成' }));
    fireEvent.click(within(screen.getByRole('complementary', { name: '字幕样式' })).getByRole('tab', { name: '配音' }));
    fireEvent.click(screen.getByRole('switch', { name: '生成目标语言配音' }));
    const picker = await screen.findByRole('combobox', { name: '配音音色' });
    await waitFor(() => expect(picker).toBeEnabled());
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole('option', { name: /Echo/ }));
    await waitFor(() => expect(current.state.voiceCode).toBe('echo'));
    expect((current.state.subtitleStyle as Record<string, CreatorJson>).fontPreset).toBe('serif');
    expect((current.state.subtitleStyle as Record<string, CreatorJson>).fontSize).toBe('large');
    expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    fireEvent.click(screen.getByRole('button', { name: '返回项目' }));
    fireEvent.click(screen.getByRole('tab', { name: '任务设置' }));
    fireEvent.click(screen.getByRole('button', { name: '调整设置' }));
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'echo'));
    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    expect(screen.getByRole('combobox', { name: '字幕字体' })).toHaveValue('serif');
    expect(screen.getByRole('combobox', { name: '字幕大小' })).toHaveValue('large');
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    fireEvent.click(screen.getByRole('button', { name: '返回 V1 成品' }));
    fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '深度编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '生成 V2' }));
    expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '确认生成 V2' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'run-stage', input: {
      stageId: 'tts', workflow: true, baseResultVersion: 1, inputResultVersion: 1
    } })));
  });

  it.each([
    ['字幕样式', 'render-horizontal'],
    ['配音', 'tts'],
    ['输出画幅', 'render-vertical']
  ])('adds %s to a subtitle result through the editor without changing its original version', async (panel, stageId) => {
    const target = subtitleArtifact(1, 'Hello world');
    let current = job({ status: 'completed', revision: 1, stages: [], artifacts: [target], state: {
      workspacePhase: 'result', resultVersion: 1, composeVideo: false, dubbing: false,
      ttsProvider: 'openai', ttsModel: 'gpt-4o-mini-tts', voiceCode: 'alloy', voiceName: 'Alloy'
    } });
    const original = { version: 1, createdAt: target.createdAt, action: 'run-stage', stageId: 'subtitle',
      description: 'Subtitles', artifactRefs: { target_subtitle: [target.id] }, changedArtifactIds: [target.id], staleArtifactIds: [], state: { ...current.state } };
    current.state.resultSnapshots = [original];
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    fireEvent.click(await screen.findByRole('tab', { name: '字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '深度编辑' }));
    fireEvent.click(screen.getByRole('button', { name: panel }));
    const dialog = screen.getByRole('complementary', { name: panel });
    expect(dialog.querySelector('video, .video-translation-subtitle-preview, .video-translation-subtitle-rendered-preview')).toBeNull();
    expect(within(dialog).queryByRole('switch', { name: '合成字幕视频' })).toBeNull();
    if (panel === '字幕样式') {
      expect(within(dialog).getByRole('radiogroup', { name: '推荐样式' })).toBeVisible();
    } else if (panel === '配音') {
      fireEvent.click(within(dialog).getByRole('switch', { name: '生成目标语言配音' }));
    } else {
      fireEvent.change(within(dialog).getByRole('combobox', { name: '输出画幅' }), { target: { value: 'vertical' } });
    }
    await waitFor(() => expect(current.state.composeVideo).toBe(true));
    expect(original.state.composeVideo).toBe(false);
    expect(original.state.dubbing).toBe(false);
    expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: '生成 V2' }));
    expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: '确认生成 V2' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'run-stage', input: {
      stageId, workflow: true, baseResultVersion: 1, inputResultVersion: 1
    } })));
    expect(readCreatorResultSnapshots(current.state.resultSnapshots)[0]?.state.composeVideo).toBe(false);
  });

  it('retains immersive timing and split edits on return and persists them through the existing subtitle action', async () => {
    const target = subtitleArtifact(1, 'Hello world');
    target.metadata.cues = [{ id: 1, start: '00:00:00,000', end: '00:00:04,000', text: 'Hello world' }];
    let current = job({ status: 'completed', revision: 1, stages: [], artifacts: [target], state: {
      sourceType: 'subtitle', workspacePhase: 'result', resultTab: 'subtitles', resultVersion: 1
    } });
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'edit-subtitle') {
        const edited = { ...target, id: 'target-edited', version: 2, metadata: { ...target.metadata, cues: request.input.cues! } };
        current = { ...current, revision: current.revision + 1, artifacts: [...current.artifacts, edited] };
      } else current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}><VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '深度编辑' }));
    expect(document.querySelector('main.video-translation-page')).toHaveAttribute('data-subtitle-immersive', 'true');
    fireEvent.click(screen.getByRole('button', { name: '跳转到 00:00:00,000' }));
    const end = screen.getByRole('spinbutton', { name: '结束时间' });
    fireEvent.change(end, { target: { value: '4.5' } }); fireEvent.blur(end);
    const playhead = screen.getByRole('slider', { name: '播放位置' });
    for (let i = 0; i < 20; i++) fireEvent.keyDown(playhead, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: '拆分' }));
    fireEvent.click(screen.getByRole('button', { name: '返回项目' }));
    expect(screen.getByRole('textbox', { name: '字幕 2' })).toHaveValue('world');
    expect(screen.getByRole('button', { name: '保存字幕' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '保存字幕' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'edit-subtitle', input: expect.objectContaining({
      artifactId: target.id, baseResultVersion: 1, preserveResultVersion: true,
      cues: [
        { id: 1, start: '00:00:00,000', end: '00:00:02,000', text: 'Hello' },
        { id: 2, start: '00:00:02,000', end: '00:00:04,500', text: 'world' }
      ]
    }) })));
    await waitFor(() => expect(screen.getByRole('button', { name: '保存字幕' })).toBeDisabled());
    expect(screen.getByRole('textbox', { name: '字幕 2' })).toHaveValue('world');
  });

  it('localizes subtitle import controls across all languages without losing the selected file or preview', () => {
    const source = { ...subtitleArtifact(1, 'Original text'), id: 'source-srt', kind: 'source_subtitle', metadata: {
      ...subtitleArtifact(1, 'Original text').metadata, source: 'local-upload', fileName: 'lecture.en.srt', cueCount: 1
    } };
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><CreatorSessionProvider
      initialJob={job({ status: 'draft', revision: 0, stages: [], artifacts: [source], state: {
        sourceType: 'subtitle', sourceUrl: '', currentStep: 0, furthestStep: 0, importedSourceSubtitleId: source.id
      } })} service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    for (const { value: language } of appLanguageOptions) {
      fireEvent.click(screen.getByRole('button', { name: language }));
      const l = createLocalizedCopy(language);
      expect(screen.getByRole('tab', { name: l('翻译视频', 'Translate video') })).toBeVisible();
      expect(screen.getByRole('tab', { name: l('翻译字幕', 'Translate subtitles') })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('heading', { name: l('添加字幕', 'Add subtitles') })).toBeVisible();
      expect(screen.getByRole('button', { name: l('更换文件', 'Replace file') })).toBeEnabled();
      expect(screen.getByRole('button', { name: l('移除字幕', 'Remove subtitles') })).toHaveAttribute('title', l('移除字幕', 'Remove subtitles'));
      expect(screen.getByRole('button', { name: new RegExp(l('添加素材', 'Add source')) })).toBeVisible();
      expect(within(screen.getByRole('group', { name: l('导入已有字幕', 'Import existing subtitles') })).getByText('lecture.en.srt')).toBeVisible();
      expect(document.querySelector('.video-translation-subtitle-import pre')).toBeVisible();
      expect(document.querySelector('.video-translation-subtitle-import pre')).toHaveTextContent('Original text');
    }
  });

  it('replaces and removes the selected SRT, then allows selecting the same file again', async () => {
    const source = { ...subtitleArtifact(1, 'Original text'), id: 'original-srt', kind: 'source_subtitle', metadata: {
      ...subtitleArtifact(1, 'Original text').metadata, source: 'local-upload', fileName: 'original.srt', cueCount: 1
    } };
    let current = job({ status: 'draft', revision: 0, stages: [], artifacts: [source], state: {
      sourceType: 'subtitle', sourceUrl: '', currentStep: 0, furthestStep: 0, importedSourceSubtitleId: source.id
    } });
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'import-subtitle') {
        const replacement = { ...source, id: `replacement-${current.revision}`, metadata: {
          ...source.metadata, fileName: String(request.input.fileName), cues: [{ id: 1, start: '00:00:00,000', end: '00:00:01,000', text: 'Replacement text' }]
        } };
        current = { ...current, revision: current.revision + 1, artifacts: [...current.artifacts, replacement],
          state: { ...current.state, importedSourceSubtitleId: replacement.id } };
      } else current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    expect(within(workspace).getByRole('button', { name: '更换文件' })).toBeEnabled();
    expect(workspace.querySelector('pre')).toHaveTextContent('Original text');
    const file = new File(['1\n00:00:00,000 --> 00:00:01,000\nReplacement text\n'], 'replacement.srt');
    fireEvent.change(screen.getByLabelText('UTF-8 SRT 文件'), { target: { files: [file] } });
    await waitFor(() => expect(workspace.querySelector('pre')).toHaveTextContent('Replacement text'));
    expect(workspace.querySelector('pre')).not.toHaveTextContent('Original text');
    await waitFor(() => expect(within(workspace).getByRole('button', { name: '移除字幕' })).toBeEnabled());
    fireEvent.click(within(workspace).getByRole('button', { name: '移除字幕' }));
    expect(workspace.querySelector('pre')).toBeNull();
    expect(within(workspace).getByText('未选择文件')).toBeVisible();
    expect(within(workspace).getByRole('button', { name: '选择文件' })).toBeEnabled();
    expect(within(workspace).queryByRole('button', { name: '移除字幕' })).not.toBeInTheDocument();
    await waitFor(() => expect(current.state.importedSourceSubtitleId).toBeNull());
    fireEvent.click(within(workspace).getByRole('button', { name: '继续' }));
    expect(within(workspace).getByRole('alert')).toHaveTextContent('请先添加需要翻译的 SRT 字幕');
    fireEvent.change(screen.getByLabelText('UTF-8 SRT 文件'), { target: { files: [file] } });
    await waitFor(() => expect(workspace.querySelector('pre')).toHaveTextContent('Replacement text'));
    expect(within(workspace).getByRole('button', { name: '更换文件' })).toBeInTheDocument();
  });

  it('switches from subtitles to combined video inputs and clears imported subtitle selections', async () => {
    let current = job({ status: 'draft', revision: 0, stages: [], state: {
      sourceType: 'subtitle', sourceUrl: '', currentStep: 0, furthestStep: 0,
      importedSourceSubtitleId: 'source-srt', importedTargetSubtitleId: 'target-srt'
    } });
    const applyAction = vi.fn(async (_id: string, request: { input: { patch: Record<string, CreatorJson> } }) => {
      current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    const sourceTabs = within(workspace).getByRole('tablist', { name: '素材类型' });
    expect(within(sourceTabs).getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(within(sourceTabs).getByRole('tab', { name: '翻译视频' }));
    expect(within(sourceTabs).getByRole('tab', { name: '翻译视频' })).toHaveAttribute('aria-selected', 'true');
    expect(within(workspace).getByRole('button', { name: '选择本地视频' })).toBeVisible();
    expect(within(workspace).getByRole('textbox', { name: '视频链接' })).toBeVisible();
    expect(within(workspace).queryByLabelText('UTF-8 SRT 文件')).not.toBeInTheDocument();
    expect(within(workspace).getByRole('navigation', { name: '翻译流程' }).querySelectorAll('li')).toHaveLength(3);
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({
      input: expect.objectContaining({ patch: expect.objectContaining({
        sourceType: 'url', importedSourceSubtitleId: null, importedTargetSubtitleId: null
      }) })
    })));
  });

  it('requires an imported SRT and starts directly from the second step without video settings', async () => {
    let current = job({ status: 'draft', revision: 0, stages: [], state: { sourceType: 'subtitle', sourceUrl: '', currentStep: 0, furthestStep: 0 } });
    const source = { ...subtitleArtifact(1, 'Hello'), id: 'source-srt', kind: 'source_subtitle', metadata: {
      ...subtitleArtifact(1, 'Hello').metadata, source: 'local-upload', fileName: 'source.srt', cueCount: 1
    } };
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'import-subtitle') current = { ...current, revision: current.revision + 1, artifacts: [source], state: { ...current.state, importedSourceSubtitleId: source.id } };
      else if (request.action === 'run-stage') current = { ...current, revision: current.revision + 1, status: 'running', stages: [stage({ id: 'srt-translation', status: 'queued', dispatchStatus: 'queued', progress: {} })] };
      else current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    const uploadSourceVideo = vi.fn();
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, uploadSourceVideo, runAgentTurn: vi.fn(), preflight: vi.fn(async () => ({ canStart: true, ready: [], blocked: [], warning: [] })) } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    expect(within(workspace).getByRole('tab', { name: '翻译字幕' })).toHaveAttribute('aria-selected', 'true');
    expect(within(workspace).getByRole('navigation', { name: '翻译流程' }).querySelectorAll('li')).toHaveLength(2);
    fireEvent.click(within(workspace).getByRole('button', { name: '继续' }));
    expect(within(workspace).getByRole('alert')).toHaveTextContent('请先添加需要翻译的 SRT 字幕');
    fireEvent.change(screen.getByLabelText('UTF-8 SRT 文件'), { target: { files: [new File(['1\n00:00:00,000 --> 00:00:01,000\nHello\n'], 'source.srt')] } });
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'import-subtitle', input: expect.objectContaining({ kind: 'source_subtitle', fileName: 'source.srt' }) })));
    await waitFor(() => expect(within(workspace).getByRole('button', { name: '继续' })).toBeEnabled());
    const subtitlePreview = workspace.querySelector('details');
    expect(subtitlePreview).toHaveAttribute('open');
    expect(subtitlePreview?.querySelector('pre')).toBeVisible();
    expect(subtitlePreview?.querySelector('pre')).toHaveTextContent('Hello');
    expect(subtitlePreview?.querySelector('pre')).toHaveTextContent('00:00:00,000');
    fireEvent.click(within(workspace).getByRole('button', { name: '继续' }));
    expect(within(workspace).getByRole('heading', { name: '设置翻译语言' })).toBeVisible();
    expect(within(workspace).queryByRole('switch', { name: '优先使用平台字幕' })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: /视频与字幕/ })).not.toBeInTheDocument();
    fireEvent.click(within(workspace).getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'run-stage', input: { stageId: 'subtitle', workflow: true } })));
    expect(uploadSourceVideo).not.toHaveBeenCalled();
    expect(within(workspace).getByRole('tab', { name: '字幕' })).toHaveAttribute('aria-selected', 'true');
    expect(within(workspace).queryByRole('tab', { name: '作品' })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('tab', { name: '配音' })).not.toBeInTheDocument();
  });

  it('restores subtitle-only results with source text, downloads and no video player', () => {
    const source = { ...subtitleArtifact(1, 'Hello'), id: 'source-srt', kind: 'source_subtitle', metadata: { ...subtitleArtifact(1, 'Hello').metadata, fileName: 'source.srt', source: 'local-upload' } };
    const target = subtitleArtifact(1, '你好');
    const bilingual = { ...target, id: 'bilingual-srt', kind: 'bilingual_subtitle' };
    const initialJob = job({ status: 'completed', revision: 1, stages: [], artifacts: [source, target, bilingual], state: {
      sourceType: 'subtitle', sourceUrl: '', importedSourceSubtitleId: source.id, composeVideo: false,
      resultSnapshots: [{ version: 1, createdAt: target.createdAt, action: 'run-stage', stageId: 'subtitle', description: '字幕翻译', artifactRefs: { source_subtitle: [source.id], target_subtitle: [target.id], bilingual_subtitle: [bilingual.id] }, changedArtifactIds: [target.id, bilingual.id], staleArtifactIds: [], state: { sourceType: 'subtitle', importedSourceSubtitleId: source.id, targetLanguage: 'zh_cn', sourceLanguage: 'en', bilingual: true } }]
    } });
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><CreatorSessionProvider initialJob={initialJob}
      service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    expect(within(workspace).getByRole('textbox', { name: '字幕原文 1' })).toHaveValue('Hello');
    expect(within(workspace).getByRole('textbox', { name: '字幕 1' })).toHaveValue('你好');
    expect(within(workspace).getByRole('button', { name: '译文 SRT' })).toBeEnabled();
    expect(within(workspace).getByRole('button', { name: '双语 SRT' })).toBeEnabled();
    expect(workspace.querySelector('video')).toBeNull();
    expect(within(workspace).queryByRole('button', { name: '下载原视频并预览' })).not.toBeInTheDocument();
    fireEvent.change(within(workspace).getByRole('textbox', { name: '字幕 1' }), { target: { value: '你好世界' } });
    expect(within(workspace).getByRole('button', { name: '保存字幕' })).toBeEnabled();
    expect(within(workspace).getByRole('button', { name: '译文 SRT' })).toBeDisabled();
    expect(within(workspace).queryByRole('button', { name: /保存并生成/ })).not.toBeInTheDocument();
    fireEvent.click(within(workspace).getByRole('tab', { name: '任务设置' }));
    expect(within(workspace).queryByText('字幕样式')).not.toBeInTheDocument();
    expect(within(workspace).queryByText('配音')).not.toBeInTheDocument();
    fireEvent.click(within(workspace).getByRole('tab', { name: /^字幕/ }));
    for (const { value: language } of appLanguageOptions) {
      fireEvent.click(screen.getByRole('button', { name: language }));
      const l = createLocalizedCopy(language);
      expect(within(workspace).getByRole('button', { name: l('译文 SRT', 'Translated SRT') })).toBeVisible();
      expect(within(workspace).getByRole('button', { name: l('双语 SRT', 'Bilingual SRT') })).toBeVisible();
      expect(within(workspace).getByRole('button', { name: l('保存字幕', 'Save subtitles') })).toBeEnabled();
      expect(within(workspace).getByRole('textbox', { name: `${l('字幕', 'Subtitles')} 1` })).toHaveValue('你好世界');
      expect(within(workspace).getByRole('textbox', { name: l(`${l('字幕', 'Subtitles')}原文 1`, `${l('字幕', 'Subtitles')} source 1`) })).toHaveValue('Hello');
    }
  });
  it.each([
    ['running', 'queued', '翻译任务等待执行'],
    ['running', 'running', '翻译进行中'],
    ['running', 'succeeded', '翻译进行中'],
    ['needs_input', 'failed', '翻译任务等待处理'],
    ['failed', 'failed', '翻译任务失败'],
    ['canceled', 'canceled', '翻译任务已终止'],
    ['failed', 'interrupted', '翻译任务已中断']
  ] as const)('restores a %s/%s translation before artifacts arrive', (jobStatus, stageStatus, title) => {
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider
      initialJob={job({ status: jobStatus, revision: 1, stages: [stage({
        id: 'generation', status: stageStatus, dispatchStatus: stageStatus === 'queued' ? 'queued' : 'claimed',
        progress: { workflow: true }
      })] })}
      service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
    ><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    expect(within(workspace).getByText(title)).toBeVisible();
    expect(workspace.querySelector('.video-translation-header p')).toHaveTextContent('https://www.youtube.com/watch?v=job-control');
    expect(within(workspace).queryByText('当前项目版本没有作品')).not.toBeInTheDocument();
  });

  it.each(['subtitle', 'prepare-source-video'])('does not label existing outputs as generating when %s targets another result or only prepares a preview', stageId => {
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider
      initialJob={job({ status: 'running', revision: 1, artifacts: [subtitleArtifact(1, '已完成字幕')],
        state: { dubbing: true, composeVideo: true },
        stages: [{ ...stage({ id: 'other-operation', status: 'running', dispatchStatus: 'claimed',
          progress: stageId === 'subtitle' ? { targetResultVersion: 2 } : { inputResultVersion: 1 }
        }), stageId }]
      })}
      service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
    ><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);
    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    fireEvent.click(within(workspace).getByRole('tab', { name: '配音' }));
    expect(within(workspace).getByText('此版本尚未生成配音')).toBeVisible();
    expect(within(workspace).queryByText('配音尚未就绪')).not.toBeInTheDocument();
  });

  it('downloads and previews a draft Douyin source without entering results and clears playback when the source changes', async () => {
    const objectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:draft-douyin') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const url = 'https://v.douyin.com/example/';
    let current = job({ status: 'draft', revision: 1, stages: [], state: { sourceUrl: url, currentStep: 0, furthestStep: 0 } });
    const openArtifact = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })));
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'run-stage') {
        const source = { ...sourceVideoArtifact(1), metadata: { sourceUrl: url, settingsSnapshot: { sourceType: 'url', sourceUrl: url }, previewOnly: true } };
        current = { ...current, revision: current.revision + 1, artifacts: [source] };
      } else {
        current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      }
      return { job: current };
    });
    let session: ReturnType<typeof useCreatorSession>;
    function Capture() { session = useCreatorSession(); return null; }
    const view = render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, openArtifact, runAgentTurn: vi.fn(), preflight: vi.fn(async () => ({ canStart: true, ready: [], blocked: [], warning: [] })) } as never}>
      <Capture /><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);
    try {
      fireEvent.click(screen.getByRole('button', { name: '下载并预览' }));
      expect(await screen.findByLabelText('原视频预览')).toHaveAttribute('src', 'blob:draft-douyin');
      expect(screen.getByRole('region', { name: '视频预览' })).toBeVisible();
      expect(screen.queryByRole('tab', { name: '字幕' })).not.toBeInTheDocument();
      expect(applyAction.mock.calls.filter(([, request]) => request.action === 'run-stage')).toEqual([
        ['job_control', expect.objectContaining({ action: 'run-stage', input: { stageId: 'preview-source-video' } })]
      ]);
      const secondUrl = 'https://v.douyin.com/second/';
      act(() => session!.applyRemoteSnapshot({ ...current, revision: current.revision + 1, state: { ...current.state, sourceUrl: secondUrl } }));
      await waitFor(() => expect(screen.queryByLabelText('原视频预览')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: '下载并预览' })).toBeEnabled();
      expect(revoke).toHaveBeenCalledWith('blob:draft-douyin');
      expect(openArtifact).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
      restoreUrlMethod('createObjectURL', objectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeDescriptor);
    }
  });
  it('keeps the same playable video and URL across snapshots, diagnostic callback changes, and language switches', async () => {
    const objectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    let objectUrlSequence = 0;
    const createObjectURL = vi.fn(() => `blob:stable-preview-${++objectUrlSequence}`);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const source = sourceVideoArtifact(1);
    const subtitle = subtitleArtifact(1, '播放期间保留的字幕');
    let current = job({ status: 'completed', revision: 1, stages: [], artifacts: [source, subtitle] });
    const openArtifact = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })));
    const service = { openArtifact, applyAction: vi.fn(), runAgentTurn: vi.fn() };
    let session: ReturnType<typeof useCreatorSession>;
    function Capture() { session = useCreatorSession(); return null; }
    function renderWorkspace() {
      return <LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><CreatorSessionProvider
        initialJob={current} service={service as never} onPreJobFailure={() => undefined}>
        <Capture /><VideoTranslationWorkspace onBack={vi.fn()} />
      </CreatorSessionProvider></LanguageProvider>;
    }
    const view = render(renderWorkspace());
    try {
      fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
      const video = await screen.findByLabelText<HTMLVideoElement>('横屏字幕视频预览');
      expect(video).toHaveAttribute('src', 'blob:stable-preview-1');
      video.currentTime = 0.5;
      fireEvent.timeUpdate(video);
      fireEvent.change(screen.getByRole('textbox', { name: '横屏字幕 1' }), { target: { value: '未保存修改' } });
      for (let revision = 2; revision <= 4; revision += 1) {
        current = { ...current, revision, artifacts: current.artifacts.map(artifact => ({ ...artifact })) };
        act(() => session!.applyRemoteSnapshot(current));
        await act(async () => { view.rerender(renderWorkspace()); });
        expect(view.container.querySelector('.video-result-subtitle-video video')).toBe(video);
        expect(video).toHaveAttribute('src', 'blob:stable-preview-1');
        expect(video.currentTime).toBe(0.5);
      }
      for (const language of ['en-US', 'sv-SE']) {
        fireEvent.click(screen.getByRole('button', { name: language }));
        await act(async () => undefined);
        expect(view.container.querySelector('.video-result-subtitle-video video')).toBe(video);
        expect(video.currentTime).toBe(0.5);
      }
      expect(screen.getByDisplayValue('未保存修改')).toBeVisible();
      expect(openArtifact).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).not.toHaveBeenCalled();
      view.unmount();
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:stable-preview-1');
    } finally {
      view.unmount();
      restoreUrlMethod('createObjectURL', objectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeDescriptor);
    }
  });
  it('updates preview startup errors after a language switch without repeating the request or losing subtitle edits', async () => {
    const subtitle = subtitleArtifact(1, '已有字幕');
    const sourceUrl = 'https://www.bilibili.com/video/BV18E421w7bf?p=3';
    const initialJob = job({ status: 'completed', revision: 1, stages: [], artifacts: [subtitle], state: {
      sourceUrl, resultVersion: 1, latestResultVersion: 1,
      resultSnapshots: [{ version: 1, createdAt: subtitle.createdAt, action: 'stage-succeeded', stageId: 'subtitle',
        description: '用户保存的字幕', artifactRefs: { target_subtitle: [subtitle.id] }, changedArtifactIds: [subtitle.id], staleArtifactIds: [],
        state: { sourceType: 'url', sourceUrl, composeVideo: false, bilingual: false }
      }]
    } });
    const raw = '后台原文：无法连接视频下载服务';
    let current = initialJob;
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'run-stage') throw new Error(raw);
      current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    const preflight = vi.fn(async () => ({ canStart: true, ready: [], blocked: [], warning: [] }));
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><CreatorSessionProvider initialJob={initialJob}
      service={{ applyAction, preflight, runAgentTurn: vi.fn() } as never}><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
    fireEvent.change(screen.getByRole('textbox', { name: '横屏字幕 1' }), { target: { value: '保留未保存字幕' } });
    fireEvent.click(screen.getByRole('button', { name: '下载原视频并预览' }));
    expect(await screen.findByText('无法启动原视频准备，请检查诊断信息后重试。')).toBeVisible();
    expect(screen.getByText(raw)).not.toBeVisible();
    const requestsBeforeSwitch = applyAction.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'en-US' }));
    expect(screen.getByText('Could not start source video preparation. Check the diagnostics and retry.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText('Det gick inte att starta förberedelsen av originalvideon. Kontrollera diagnostiken och försök igen.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Försök ladda ned originalvideon igen' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: /undertexter 1$/ })).toHaveValue('保留未保存字幕');
    expect(screen.getByRole('button', { name: /V1/ })).toBeInTheDocument();
    expect(screen.getByText(raw)).not.toBeVisible();
    expect(applyAction).toHaveBeenCalledTimes(requestsBeforeSwitch);
    expect(applyAction.mock.calls.filter(([, request]) => request.action === 'run-stage')).toHaveLength(1);
    expect(preflight).toHaveBeenCalledOnce();
    expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'run-stage', input: { stageId: 'prepare-source-video', inputResultVersion: 1 } }));
  });
  it('downloads only the selected result source and preserves unsaved subtitles when preview becomes ready', async () => {
    const objectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:downloaded-preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const subtitles = [subtitleArtifact(1, '版本一字幕'), subtitleArtifact(2, '版本二字幕')];
    let current = job({ status: 'completed', revision: 2, stages: [], artifacts: subtitles,
      state: { sourceUrl: 'https://www.bilibili.com/video/BV18E421w7bf?p=2', resultVersion: 1, latestResultVersion: 2,
        resultSnapshots: subtitles.map((artifact, index) => ({
          version: index + 1, createdAt: artifact.createdAt, action: 'stage-succeeded', stageId: 'subtitle',
          description: `字幕版本 ${index + 1}`, artifactRefs: { target_subtitle: [artifact.id] },
          changedArtifactIds: [artifact.id], staleArtifactIds: [],
          state: { sourceType: 'url', sourceUrl: `https://www.bilibili.com/video/BV18E421w7bf?p=${index === 0 ? 3 : 2}`, composeVideo: false, bilingual: false }
        }))
      }
    });
    let session: ReturnType<typeof useCreatorSession>;
    function Capture() { session = useCreatorSession(); return null; }
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'run-stage') {
        current = { ...current, revision: current.revision + 1,
          stages: [{ ...stage({ id: 'preview', status: 'running', dispatchStatus: 'claimed',
            progress: { inputResultVersion: request.input.inputResultVersion!, phase: 'downloading', percent: 40 } }),
            stageId: 'prepare-source-video', executor: 'download' }]
        };
      } else current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    const openArtifact = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })));
    const preflight = vi.fn(async () => ({ canStart: true, ready: [], blocked: [], warning: [] }));
    const view = render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, openArtifact, preflight, runAgentTurn: vi.fn() } as never}>
      <Capture /><VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    try {
      fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
      fireEvent.change(screen.getByRole('textbox', { name: '横屏字幕 1' }), { target: { value: '尚未保存的修改' } });
      expect(applyAction.mock.calls.some(([, request]) => request.action === 'run-stage')).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: '下载原视频并预览' }));
      await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({
        action: 'run-stage', input: { stageId: 'prepare-source-video', inputResultVersion: 1 }
      })));
      expect(preflight).toHaveBeenCalledWith('job_control', 'prepare-source-video', { inputResultVersion: 1 });
      expect(screen.getByRole('button', { name: /正在准备/ })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('尚未保存的修改');
      const video = sourceVideoArtifact(1);
      const snapshots = readCreatorResultSnapshots(current.state.resultSnapshots);
      current = { ...current, revision: current.revision + 1, artifacts: [...current.artifacts, video],
        stages: current.stages.map(candidate => ({ ...candidate, status: 'succeeded', dispatchStatus: 'finished' })),
        state: { ...current.state, resultSnapshots: snapshots.map(snapshot => snapshot.version === 1
          ? { ...snapshot, artifactRefs: { ...snapshot.artifactRefs, source_video: [video.id] } } : snapshot) as CreatorJson }
      };
      act(() => session!.applyRemoteSnapshot(current));
      expect(await screen.findByLabelText('横屏字幕视频预览')).toHaveAttribute('src', 'blob:downloaded-preview');
      expect(screen.getByRole('button', { name: '项目 V1' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('尚未保存的修改');
      expect(screen.getByRole('button', { name: '保存横屏字幕' })).toBeEnabled();
      expect(current.state.sourceUrl).toBe('https://www.bilibili.com/video/BV18E421w7bf?p=2');
      expect(current.state.composeVideo).toBe(false);
      expect(readCreatorResultSnapshots(current.state.resultSnapshots)).toHaveLength(2);
      expect(applyAction.mock.calls.filter(([, request]) => request.action === 'run-stage')).toHaveLength(1);
    } finally {
      view.unmount();
      restoreUrlMethod('createObjectURL', objectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeDescriptor);
    }
  });

  it('shows English file picker and output format labels', () => {
    render(<LanguageProvider initialPreference="en-US"><CreatorSessionProvider
      initialJob={job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 1, composeVideo: true } })}
      service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
    ><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);

    fireEvent.click(screen.getByRole('switch', { name: 'Import existing subtitles' }));
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.getByText('No file selected')).toBeInTheDocument();
    expect(screen.getByLabelText('UTF-8 SRT file')).toHaveAttribute('type', 'file');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('switch', { name: 'Render subtitled video' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Output format' })).toHaveValue('horizontal');
    expect(screen.getByRole('option', { name: '16:9 + 9:16 Both' })).toBeInTheDocument();
    expect(screen.queryByText('双画幅')).not.toBeInTheDocument();
  });

  it('restores an old fourth-step draft on the final step of the three-step workflow', () => {
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider
      initialJob={job({ status: 'draft', revision: 0, stages: [], state: {
        currentStep: 3, furthestStep: 3, composeVideo: true, dubbing: true, voiceCode: 'marin', voiceName: 'Marin'
      } })}
      service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
    ><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);

    const steps = screen.getByRole('navigation', { name: '翻译流程' });
    expect(within(steps).getAllByRole('button')).toHaveLength(3);
    expect(within(steps).getByRole('button', { name: '3 视频与字幕' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('switch', { name: '生成目标语言配音' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('任务摘要')).toHaveTextContent('marin');
    expect(screen.queryByRole('button', { name: '继续' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '视频翻译操作区' })).getByRole('button', { name: '开始翻译' })).toBeInTheDocument();
  });

  it('preserves the selected voice but submits without dubbing when video composition is disabled', async () => {
    let current = job({ status: 'draft', revision: 0, stages: [], state: {
      currentStep: 2, furthestStep: 2, composeVideo: true, dubbing: true, voiceCode: 'marin', voiceName: 'Marin'
    } });
    const stageSettings: CreatorJob['state'][] = [];
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'run-stage') stageSettings.push({ ...current.state });
      current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current}
      service={{ applyAction, runAgentTurn: vi.fn() } as never}
    ><VideoTranslationWorkspace onBack={vi.fn()} /></CreatorSessionProvider></LanguageProvider>);

    fireEvent.click(screen.getByRole('switch', { name: '合成字幕视频' }));
    expect(screen.queryByRole('switch', { name: '生成目标语言配音' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('任务摘要')).not.toHaveTextContent('配音');
    await waitFor(() => expect(current.state).toMatchObject({ composeVideo: false, dubbing: false, voiceCode: 'marin' }));

    fireEvent.click(screen.getByRole('switch', { name: '合成字幕视频' }));
    fireEvent.click(screen.getByRole('switch', { name: '生成目标语言配音' }));
    expect(screen.getByLabelText('任务摘要')).toHaveTextContent('marin');
    fireEvent.click(screen.getByRole('switch', { name: '合成字幕视频' }));
    fireEvent.click(within(screen.getByRole('region', { name: '视频翻译操作区' })).getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(stageSettings).toEqual([expect.objectContaining({ composeVideo: false, dubbing: false, voiceCode: 'marin' })]));
  });

  it('keeps an imported translation in configuration and shows its persisted metadata', async () => {
    let current = job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 1, furthestStep: 1 } });
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'import-subtitle') {
        const artifact = subtitleArtifact(1, '已导入字幕');
        artifact.metadata = { ...artifact.metadata, fileName: 'translated.srt', source: 'local-upload', language: 'zh_cn', cueCount: 1 };
        current = { ...current, revision: current.revision + 1, artifacts: [artifact], state: { ...current.state, importedTargetSubtitleId: artifact.id,
          resultSnapshots: [{ version: 1, createdAt: current.createdAt, action: 'import-subtitle', stageId: null, description: '导入本地字幕', artifactRefs: { target_subtitle: [artifact.id] }, changedArtifactIds: [artifact.id], staleArtifactIds: [], state: current.state }]
        } };
      } else current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch as object } };
      return { job: current };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={current} service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole('switch', { name: '导入已有字幕' }));
    fireEvent.change(screen.getByRole('combobox', { name: '字幕类型' }), { target: { value: 'target_subtitle' } });
    fireEvent.change(screen.getByLabelText('UTF-8 SRT 文件'), { target: { files: [new File(['srt'], 'translated.srt')] } });
    expect(await screen.findByText('本地导入 · translated.srt · zh_cn · 1 条字幕 · v1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '设置翻译语言' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));
    fireEvent.click(within(screen.getByRole('region', { name: '视频翻译操作区' })).getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'run-stage', input: { stageId: 'subtitle', workflow: true } })));
  });
  it.each(['source_subtitle', 'target_subtitle'])('uploads %s through the shared action and hides raw daemon validation errors', async kind => {
    const initial = job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 1, furthestStep: 1 } });
    const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
      if (request.action === 'import-subtitle') throw new Error('Invalid UTF-8 SRT: timeline 2');
      return { job: { ...initial, revision: 1, state: { ...initial.state, ...request.input.patch as object } } };
    });
    render(<LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={initial} service={{ applyAction, runAgentTurn: vi.fn() } as never}>
      <VideoTranslationWorkspace onBack={vi.fn()} />
    </CreatorSessionProvider></LanguageProvider>);
    expect(screen.queryByRole('combobox', { name: '字幕类型' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: '导入已有字幕' }));
    fireEvent.change(screen.getByRole('combobox', { name: '字幕类型' }), { target: { value: kind } });
    fireEvent.change(screen.getByLabelText('UTF-8 SRT 文件'), { target: { files: [new File(['invalid'], 'local.srt', { type: 'application/x-subrip' })] } });
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith('job_control', expect.objectContaining({ action: 'import-subtitle', input: {
      kind, fileName: 'local.srt', language: kind === 'source_subtitle' ? 'en' : 'zh_cn', contentBase64: btoa('invalid')
    } })));
    expect(within(screen.getByRole('group', { name: '导入已有字幕' })).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid UTF-8 SRT: timeline 2')).not.toBeInTheDocument();
    expect(await screen.findByText(/操作未完成 错误码：CLIENT_OPERATION_FAILED/)).toBeVisible();
    expect(screen.queryByText(/诊断编号：OC-/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('UTF-8 SRT 文件')).not.toBeDisabled();
  });
  it('restores a video translation v1 job from legacy subtitle fields', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft',
            revision: 0,
            stages: [],
            state: {
              currentStep: 2,
              furthestStep: 2,
              composeVideo: true,
              subtitleFont: 'serif',
              subtitleSize: 'large',
              subtitleColor: '#7EE7FF'
            }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    expect(screen.getByRole('radio', { name: '经典' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    expect(screen.getByRole('combobox', { name: '字幕字体' })).toHaveValue('serif');
    expect(screen.getByRole('combobox', { name: '字幕大小' })).toHaveValue('large');
    expect(screen.getByRole('button', { name: '选择译文颜色' })).toHaveTextContent('#7EE7FF');
    fireEvent.click(screen.getByRole('button', { name: '选择译文颜色' }));
    expect(screen.getByRole('button', { name: '#7EE7FF' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('validates HEX colors, updates the preview, and closes the palette with Escape or an outside click', async () => {
    const openSubtitlePreview = vi.fn(() => new Promise<Response>(() => {}));
    render(<LanguageProvider initialPreference="zh-CN">
      <CreatorSessionProvider initialJob={job({ status: 'draft', revision: 0, stages: [], state: {
        currentStep: 2, furthestStep: 2, composeVideo: true
      } })} service={{ applyAction: vi.fn(), runAgentTurn: vi.fn(), openSubtitlePreview } as never}>
        <VideoTranslationWorkspace onBack={vi.fn()} />
      </CreatorSessionProvider>
    </LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    const trigger = screen.getByRole('button', { name: '选择译文颜色' });
    expect(screen.queryByRole('dialog', { name: '译文颜色色板' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const hex = screen.getByRole('textbox', { name: '译文颜色 HEX' });
    await waitFor(() => expect(openSubtitlePreview).toHaveBeenCalledWith(
      expect.objectContaining({ subtitleStyle: expect.objectContaining({ primaryColor: '#FFFFFF' }) }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ));
    fireEvent.change(hex, { target: { value: '#12' } });
    expect(trigger).toHaveTextContent('#FFFFFF');
    fireEvent.change(hex, { target: { value: '123abc' } });
    await waitFor(() => expect(openSubtitlePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtitleStyle: expect.objectContaining({ primaryColor: '#123ABC' }) }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ));
    expect(trigger).toHaveTextContent('#123ABC');
    fireEvent.keyDown(hex, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByRole('textbox', { name: '译文颜色 HEX' })).toHaveValue('#123ABC');
    fireEvent.pointerDown(screen.getByRole('combobox', { name: '字幕字体' }));
    expect(screen.queryByRole('dialog', { name: '译文颜色色板' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '自定义字幕样式' })).toBeInTheDocument();
  });

  it('applies subtitle style presets and reverts drawer edits on cancel', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 2, furthestStep: 2, composeVideo: true } })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('radio', { name: '经典' }));
    expect(screen.getByRole('radio', { name: '经典' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '电影感' }));
    expect(screen.getByRole('radio', { name: '电影感' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '经典' })).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    const drawer = screen.getByRole('dialog', { name: '自定义字幕样式' });
    expect(within(drawer).getByRole('combobox', { name: '字幕字体' })).toHaveValue('serif');
    fireEvent.change(within(drawer).getByRole('combobox', { name: '字幕大小' }), { target: { value: 'large' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '自定义字幕样式' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '电影感' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    fireEvent.change(screen.getByRole('combobox', { name: '字幕大小' }), { target: { value: 'large' } });
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.getByRole('radio', { name: '电影感' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: '自定义样式' })).toHaveAttribute('data-active', 'true');
  });

  it('saves the current subtitle style as a local template and deletes it', () => {
    window.localStorage.removeItem('opencreator.videoTranslation.savedSubtitleStyles');
    const renderWorkspace = () => render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 2, furthestStep: 2, composeVideo: true } })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );
    const { unmount } = renderWorkspace();

    expect(screen.getByRole('tab', { name: '推荐' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '我的样式' }));
    expect(screen.getByText(/还没有保存的样式/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    expect(screen.getByRole('region', { name: '字幕样式预览' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: '描边宽度' }), { target: { value: '6' } });
    expect(screen.getByRole('slider', { name: '描边宽度滑块' })).toHaveValue('6');
    fireEvent.change(screen.getByRole('slider', { name: '模糊滑块' }), { target: { value: '3' } });
    expect(screen.getByRole('spinbutton', { name: '模糊' })).toHaveValue(3);
    fireEvent.click(screen.getByRole('button', { name: '另存为模版' }));
    fireEvent.change(screen.getByRole('textbox', { name: '模版名称' }), { target: { value: '口播粗描边' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    fireEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(screen.getByRole('tab', { name: '我的样式' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('radio', { name: '经典' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '口播粗描边' })).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(window.localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles') ?? '[]')).toEqual([
      expect.objectContaining({ name: '口播粗描边', style: expect.objectContaining({ subtitleOutlineWidth: 6, subtitleShadowBlur: 3 }) })
    ]);

    unmount();
    renderWorkspace();
    expect(screen.getByRole('tab', { name: '我的样式' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '口播粗描边' }));
    expect(screen.getByRole('radio', { name: '口播粗描边' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: '删除模版 口播粗描边' }));
    expect(screen.queryByRole('radio', { name: '口播粗描边' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '推荐' })).toHaveAttribute('aria-selected', 'true');
    expect(window.localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles')).toBe('[]');
  });

  it('edits a saved subtitle template and restores the active style on cancel', () => {
    window.localStorage.setItem('opencreator.videoTranslation.savedSubtitleStyles', JSON.stringify([{
      id: 'saved-test',
      name: '口播',
      style: { subtitleFont: 'serif', subtitleWeight: 'bold', subtitleSize: 'large', subtitleColor: '#FFE45C', subtitleSecondaryColor: '#FFFFFF', subtitleOutlineColor: '#000000', subtitleOutlineWidth: 3, subtitleShadowEnabled: true, subtitleShadowColor: '#000000', subtitleShadowOpacity: 0.6, subtitleShadowOffsetX: 1.5, subtitleShadowOffsetY: 1.5, subtitleShadowBlur: 0.5 }
    }]));
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 2, furthestStep: 2, composeVideo: true } })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    // Cancel restores the style that was active before editing and leaves the template unchanged.
    fireEvent.click(screen.getByRole('button', { name: '编辑模版 口播' }));
    const drawer = screen.getByRole('dialog', { name: '编辑模版' });
    expect(within(drawer).getByRole('combobox', { name: '字幕字体' })).toHaveValue('serif');
    fireEvent.change(within(drawer).getByRole('combobox', { name: '字幕大小' }), { target: { value: 'small' } });
    fireEvent.click(within(drawer).getByRole('button', { name: '取消' }));
    expect(screen.getByRole('radio', { name: '口播' })).toHaveAttribute('aria-checked', 'false');
    expect(JSON.parse(window.localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles') ?? '[]')[0].style.subtitleSize).toBe('large');

    fireEvent.click(screen.getByRole('button', { name: '编辑模版 口播' }));
    fireEvent.change(screen.getByRole('textbox', { name: '模版名称' }), { target: { value: '口播小字' } });
    fireEvent.change(screen.getByRole('combobox', { name: '字幕大小' }), { target: { value: 'small' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(screen.queryByRole('dialog', { name: '编辑模版' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '口播小字' })).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(window.localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'saved-test', name: '口播小字', style: expect.objectContaining({ subtitleSize: 'small', subtitleFont: 'serif' }) })
    ]);
    window.localStorage.removeItem('opencreator.videoTranslation.savedSubtitleStyles');
  });

  it('uses the same preset and custom color controls for original, outline, and shadow', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({ status: 'draft', revision: 0, stages: [], state: { currentStep: 2, furthestStep: 2, composeVideo: true } })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    for (const label of ['原文颜色', '描边颜色', '阴影颜色']) {
      fireEvent.click(screen.getByRole('button', { name: `选择${label}` }));
      const preset = screen.getByRole('button', { name: `${label} #7EE7FF` });
      fireEvent.click(preset);
      expect(preset).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('textbox', { name: `${label} HEX` })).toHaveValue('#7EE7FF');
    }
    // Two from the open color picker, five from the outline and shadow range controls.
    expect(screen.getAllByRole('slider')).toHaveLength(7);
    expect(screen.queryByText('自定义')).not.toBeInTheDocument();
  });

  it('uses the platform poster and actual dimensions when metadata provides them', async () => {
    const getVideoMetadata = vi.fn(async () => ({
      platform: 'bilibili' as const,
      title: '4:3 source',
      thumbnailUrl: 'https://images.example.test/source.jpg',
      width: 1024,
      height: 768
    }));
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft', revision: 0, stages: [],
            state: { currentStep: 2, furthestStep: 2, composeVideo: true, sourceUrl: 'https://www.bilibili.com/video/BV1abc' }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} videoMetadataService={{ getVideoMetadata }} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const preview = screen.getByRole('region', { name: '字幕样式预览' });
    await waitFor(() => expect(preview).toHaveAttribute('data-ratio', '4:3'));
    expect(preview.querySelector('img.video-translation-subtitle-preview-media')).toHaveAttribute(
      'src', 'https://images.example.test/source.jpg'
    );
    expect(preview.querySelector(':scope > div')).toHaveStyle({ '--subtitle-preview-aspect-ratio': '1024 / 768' });
    expect(getVideoMetadata).toHaveBeenCalledWith('https://www.bilibili.com/video/BV1abc');
  });

  it('shows a YouTube Shorts poster in a portrait frame without video metadata', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft', revision: 0, stages: [],
            state: { currentStep: 2, furthestStep: 2, composeVideo: true, sourceUrl: 'https://www.youtube.com/shorts/portrait123' }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const preview = screen.getByRole('region', { name: '字幕样式预览' });
    expect(preview).toHaveAttribute('data-ratio', '9:16');
    expect(preview.querySelector('img.video-translation-subtitle-preview-media')).toHaveAttribute(
      'src', 'https://i.ytimg.com/vi/portrait123/hqdefault.jpg'
    );
  });

  it('seeks a playable source to a still frame and uses its nonstandard aspect ratio', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft', revision: 0, stages: [],
            state: { currentStep: 2, furthestStep: 2, composeVideo: true, sourceUrl: 'https://video.example.test/source.mp4' }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const preview = screen.getByRole('region', { name: '字幕样式预览' });
    const video = preview.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://video.example.test/source.mp4');
    Object.defineProperties(video!, {
      videoWidth: { configurable: true, value: 1440 },
      videoHeight: { configurable: true, value: 1080 },
      duration: { configurable: true, value: 100 }
    });
    fireEvent.loadedMetadata(video!);
    fireEvent.seeked(video!);

    expect(video).toHaveProperty('currentTime', 5);
    expect(video).toHaveAttribute('data-ready', 'true');
    expect(preview).toHaveAttribute('data-ratio', '4:3');
    expect(preview.querySelector(':scope > div')).toHaveStyle({ '--subtitle-preview-aspect-ratio': '1440 / 1080' });

    fireEvent.change(screen.getByRole('combobox', { name: '输出画幅' }), { target: { value: 'vertical' } });
    expect(screen.getByRole('region', { name: '字幕样式预览' })).toHaveAttribute('data-ratio', '9:16');
    expect(screen.getByRole('region', { name: '字幕样式预览' })).toHaveAttribute('data-converted', 'true');
  });

  it('previews vertical titles live for portrait and dual output and hides them for landscape output', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft', revision: 0, stages: [],
            state: { currentStep: 2, furthestStep: 2, composeVideo: true }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const format = screen.getByRole('combobox', { name: '输出画幅' });
    const preview = screen.getByRole('region', { name: '字幕样式预览' });
    fireEvent.change(format, { target: { value: 'vertical' } });
    fireEvent.change(screen.getByRole('textbox', { name: /竖屏主标题/ }), { target: { value: '1111' } });
    fireEvent.change(screen.getByRole('textbox', { name: /竖屏副标题/ }), { target: { value: '2222' } });
    expect(within(preview).getByText('1111')).toBeVisible();
    expect(within(preview).getByText('2222')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: /竖屏主标题/ }), { target: { value: '更新标题' } });
    expect(within(preview).queryByText('1111')).not.toBeInTheDocument();
    expect(within(preview).getByText('更新标题')).toBeVisible();

    fireEvent.change(format, { target: { value: 'all' } });
    expect(preview).toHaveAttribute('data-ratio', '9:16');
    expect(within(preview).getByText('更新标题')).toBeVisible();
    expect(within(preview).getByText('2222')).toBeVisible();

    fireEvent.change(format, { target: { value: 'horizontal' } });
    expect(within(preview).queryByText('更新标题')).not.toBeInTheDocument();
    expect(within(preview).queryByText('2222')).not.toBeInTheDocument();
    fireEvent.change(format, { target: { value: 'vertical' } });
    fireEvent.change(screen.getByRole('textbox', { name: /竖屏主标题/ }), { target: { value: '' } });
    expect(within(preview).queryByText('更新标题')).not.toBeInTheDocument();
    expect(within(preview).getByText('2222')).toBeVisible();
  });

  it('uses a local video still and preserves its portrait 3:4 ratio', () => {
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:source-video')
      .mockReturnValueOnce('blob:subtitle-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    let view: ReturnType<typeof render> | undefined;

    try {
      view = render(
        <LanguageProvider initialPreference="zh-CN">
          <CreatorSessionProvider
            initialJob={job({ status: 'draft', revision: 0, stages: [], state: { sourceUrl: '', currentStep: 0, furthestStep: 0 } })}
            service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
          >
            <VideoTranslationWorkspace onBack={vi.fn()} />
          </CreatorSessionProvider>
        </LanguageProvider>
      );
      const videoTab = screen.getByRole('tab', { name: '翻译视频' });
      expect(videoTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: '选择本地视频' })).toBeVisible();
      expect(screen.getByRole('textbox', { name: '视频链接' })).toBeVisible();
      const file = new File(['video'], 'portrait.mp4', { type: 'video/mp4' });
      fireEvent.change(screen.getByLabelText('上传本地视频'), { target: { files: [file] } });
      expect(videoTab).toHaveAttribute('aria-selected', 'true');
      fireEvent.click(videoTab);
      const sourceVideo = screen.getByLabelText('本地视频预览');
      Object.defineProperties(sourceVideo, {
        videoWidth: { configurable: true, value: 1080 },
        videoHeight: { configurable: true, value: 1440 }
      });
      fireEvent.loadedMetadata(sourceVideo);
      fireEvent.click(screen.getByRole('button', { name: '继续' }));
      fireEvent.click(screen.getByRole('button', { name: '继续' }));
      fireEvent.click(screen.getByRole('switch', { name: '合成字幕视频' }));

      const preview = screen.getByRole('region', { name: '字幕样式预览' });
      expect(preview).toHaveAttribute('data-ratio', '3:4');
      expect(preview.querySelector('video')).toHaveAttribute('src', 'blob:subtitle-preview');
      expect(createObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      view?.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:source-video');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:subtitle-preview');
      restoreUrlMethod('createObjectURL', createObjectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeObjectUrlDescriptor);
    }
  });

  it('loads the saved source video for a resumed subtitle-style preview', async () => {
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn(() => 'blob:saved-source');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const source = sourceVideoArtifact(1);
    const openArtifact = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })));
    const view = render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft', revision: 0, stages: [], artifacts: [source],
            state: {
              currentStep: 2,
              furthestStep: 2,
              composeVideo: true,
              sourceType: 'file',
              sourceUrl: '',
              sourceFileName: 'saved.mp4',
              sourceArtifactId: source.id
            }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn(), openArtifact } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    try {
      const preview = screen.getByRole('region', { name: '字幕样式预览' });
      expect(preview).toHaveAttribute('data-ratio', '16:9');
      await waitFor(() => expect(preview.querySelector('video')).toHaveAttribute('src', 'blob:saved-source'));
      expect(openArtifact).toHaveBeenCalledWith('job_control', source.id);
    } finally {
      view.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:saved-source');
      restoreUrlMethod('createObjectURL', createObjectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeObjectUrlDescriptor);
    }
  });

  it.each([1, 2])('edits every subtitle style field and persists one structured patch for template v%s', async templateVersion => {
    let currentJob = job({
      status: 'draft',
      revision: 0,
      stages: [],
      templateVersion,
      state: {
        currentStep: 2,
        furthestStep: 2,
        composeVideo: true,
        subtitleStyle: {
          fontPreset: 'sans',
          fontWeight: 'bold',
          fontSize: 'medium',
          primaryColor: '#FFFFFF',
          secondaryColor: '#FFD45C',
          outlineColor: '#000000',
          outlineWidth: 2,
          shadow: {
            enabled: false,
            color: '#000000',
            opacity: 0.65,
            offsetX: 2,
            offsetY: 2,
            blur: 1
          }
        }
      }
    });
    const applyAction = vi.fn(async (_jobId: string, request: {
      action: string;
      input: { patch?: Record<string, CreatorJson> };
    }) => {
      currentJob = {
        ...currentJob,
        revision: currentJob.revision + 1,
        state: {
          ...currentJob.state,
          ...(request.input.patch ?? {})
        }
      };
      return {
        job: currentJob,
        receipt: {
          actor: 'user' as const,
          action: request.action,
          summary: request.action,
          affectedArtifacts: [],
          newRevision: currentJob.revision,
          createdAt: currentJob.updatedAt
        }
      };
    });

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={currentJob}
          service={{ applyAction, runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: '自定义样式' }));
    fireEvent.change(screen.getByRole('combobox', { name: '字幕字体' }), {
      target: { value: 'rounded' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '字幕字重' }), {
      target: { value: 'regular' }
    });
    fireEvent.change(screen.getByRole('combobox', { name: '字幕大小' }), {
      target: { value: 'small' }
    });
    fireEvent.click(screen.getByRole('button', { name: '选择译文颜色' }));
    fireEvent.change(screen.getByRole('textbox', { name: '译文颜色 HEX' }), {
      target: { value: '#123456' }
    });
    fireEvent.click(screen.getByRole('button', { name: '选择原文颜色' }));
    fireEvent.change(screen.getByRole('textbox', { name: '原文颜色 HEX' }), {
      target: { value: '#654321' }
    });
    fireEvent.click(screen.getByRole('button', { name: '选择描边颜色' }));
    fireEvent.change(screen.getByRole('textbox', { name: '描边颜色 HEX' }), {
      target: { value: '#111111' }
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '描边宽度' }), {
      target: { value: '3.5' }
    });
    fireEvent.click(screen.getByRole('switch', { name: '字幕阴影' }));
    fireEvent.click(screen.getByRole('button', { name: '选择阴影颜色' }));
    fireEvent.change(screen.getByRole('textbox', { name: '阴影颜色 HEX' }), {
      target: { value: '#222222' }
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '不透明度' }), {
      target: { value: '0.4' }
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '水平偏移' }), {
      target: { value: '-4' }
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '垂直偏移' }), {
      target: { value: '6' }
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: '模糊' }), {
      target: { value: '2.5' }
    });

    await waitFor(() => expect(applyAction).toHaveBeenCalledTimes(1));
    expect(applyAction).toHaveBeenCalledWith(
      'job_control',
      expect.objectContaining({
        action: 'update-settings',
        input: expect.objectContaining({
          patch: expect.objectContaining({
            subtitleStyle: {
              fontPreset: 'rounded',
              fontWeight: 'regular',
              fontSize: 'small',
              primaryColor: '#123456',
              secondaryColor: '#654321',
              outlineColor: '#111111',
              outlineWidth: 3.5,
              shadow: {
                enabled: true,
                color: '#222222',
                opacity: 0.4,
                offsetX: -4,
                offsetY: 6,
                blur: 2.5
              }
            }
          })
        })
      })
    );
    const persistedPatch = applyAction.mock.calls[0]?.[1].input.patch ?? {};
    expect(persistedPatch).not.toHaveProperty('subtitleFont');
    expect(persistedPatch).not.toHaveProperty('subtitleSize');
    expect(persistedPatch).not.toHaveProperty('subtitleColor');
  });

  it('offers the expanded source language catalog alongside the complete target language catalog', () => {
    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={job({
            status: 'draft',
            revision: 0,
            stages: [],
            state: { currentStep: 1, furthestStep: 1 }
          })}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const sourceSelect = screen.getByRole('combobox', { name: '源语言' });
    const targetSelect = screen.getByRole('combobox', { name: '翻译为' });
    const sourceOptions = within(sourceSelect).getAllByRole('option');
    const targetOptions = within(targetSelect).getAllByRole('option');
    const targetValues = targetOptions.map(option => (option as HTMLOptionElement).value);

    expect(sourceOptions).toHaveLength(14);
    for (const [name, value] of [
      ['Español', 'es'],
      ['Français', 'fr'],
      ['Italiano', 'it'],
      ['Português (Brasil)', 'pt'],
      ['Bahasa Indonesia', 'id'],
      ['ภาษาไทย', 'th']
    ]) {
      expect(within(sourceSelect).getByRole('option', { name })).toHaveAttribute('value', value);
    }
    expect(targetOptions).toHaveLength(101);
    expect(new Set(targetValues).size).toBe(101);
    expect(within(targetSelect).getByRole('option', { name: 'বাংলা' })).toHaveAttribute('value', 'bn');
    expect(within(targetSelect).getByRole('option', { name: 'Gàidhlig' })).toHaveAttribute('value', 'gd');
    expect(within(targetSelect).getByRole('option', { name: 'Gaelg' })).toHaveAttribute('value', 'gv');
  });

  it('uses the source video for synchronized subtitle preview when no rendered video exists', async () => {
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn(() => 'blob:source-video-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const source = sourceVideoArtifact(1);
    const subtitle = subtitleArtifact(1, '同步字幕');
    const currentJob = job({
      status: 'completed',
      revision: 2,
      stages: [],
      artifacts: [source, subtitle]
    });
    const openArtifact = vi.fn(async () => new Response(new Blob(['video'], { type: 'video/mp4' })));
    const view = render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={currentJob}
          service={{
            applyAction: vi.fn(),
            runAgentTurn: vi.fn(),
            openArtifact
          } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    try {
      expect(await screen.findByRole('heading', { name: '视频翻译项目' })).toBeInTheDocument();
      await waitFor(() => expect(openArtifact).toHaveBeenCalledWith('job_control', source.id));
      expect(createObjectURL).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
      expect(await screen.findByLabelText('横屏字幕视频预览')).toHaveAttribute(
        'src',
        'blob:source-video-preview'
      );
      expect(screen.getByText('当前使用原视频同步预览')).toBeInTheDocument();
    } finally {
      view.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:source-video-preview');
      restoreUrlMethod('createObjectURL', createObjectUrlDescriptor);
      restoreUrlMethod('revokeObjectURL', revokeObjectUrlDescriptor);
    }
  });

  it('shows and exports the bilingual subtitle artifact for a bilingual project version', async () => {
    const target = subtitleArtifact(2, '译文在上');
    const source = textSubtitleArtifact({
      id: 'source-subtitle-v2',
      kind: 'source_subtitle',
      version: 2,
      fileName: 'origin_language_srt.srt',
      text: 'Source below'
    });
    const bilingual = textSubtitleArtifact({
      id: 'bilingual-subtitle-v2',
      kind: 'bilingual_subtitle',
      version: 2,
      fileName: 'bilingual_srt.srt',
      text: '译文在上\nSource below'
    });
    const currentJob = job({
      status: 'completed',
      revision: 4,
      stages: [],
      artifacts: [target, source, bilingual],
      state: {
        workspacePhase: 'result',
        resultVersion: 2,
        latestResultVersion: 2,
        resultTab: 'video',
        resultSnapshots: [{
          version: 2,
          createdAt: '2026-09-03T07:02:33.597Z',
          action: 'stage-succeeded',
          stageId: 'subtitle',
          description: '生成字幕',
          artifactRefs: {
            target_subtitle: [target.id],
            source_subtitle: [source.id],
            bilingual_subtitle: [bilingual.id]
          },
          changedArtifactIds: [target.id, source.id, bilingual.id],
          staleArtifactIds: [],
          state: {
            sourceType: 'url',
            sourceUrl: 'https://www.youtube.com/watch?v=job-control',
            sourceLanguage: 'en',
            targetLanguage: 'zh_cn',
            bilingual: true,
            subtitlePosition: 'top',
            preferPlatformCaptions: true,
            dubbing: false,
            voiceCode: '',
            composeVideo: false,
            videoFormat: 'horizontal',
            verticalTitle: '',
            verticalSubtitle: ''
          }
        }]
      }
    });

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={currentJob}
          service={{ applyAction: vi.fn(), runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    expect(await screen.findByText('bilingual_srt.srt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
    expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('译文在上');
    expect(screen.getByLabelText('横屏字幕原文 1')).toHaveValue('Source below');
    fireEvent.change(screen.getByLabelText('横屏字幕原文 1'), { target: { value: 'Corrected English source' } });
    expect(screen.getByLabelText('横屏字幕原文 1')).toHaveValue('Corrected English source');
    expect(screen.getByRole('button', { name: '保存横屏字幕' })).toBeEnabled();
  });

  it('keeps subtitle edits across Runtime revisions and saves the selected subtitle format', async () => {
    const target = subtitleArtifact(1, '横屏原字幕');
    const source = textSubtitleArtifact({
      id: 'source-subtitle-v1',
      kind: 'source_subtitle',
      version: 1,
      fileName: 'origin_language_srt.srt',
      text: 'Original horizontal subtitle'
    });
    const vertical: CreatorArtifact = {
      id: 'vertical-subtitle-v1',
      jobId: 'job_control',
      kind: 'vertical_subtitle',
      version: 1,
      status: 'completed',
      path: '/tmp/vertical-subtitle-v1.srt',
      scopeKey: null,
      inputFingerprint: null,
      sha256: null,
      sourceArtifactIds: [],
      metadata: {
        resultVersion: 1,
        fileName: 'short_origin_mixed_srt.srt',
        cues: [{
          id: 1,
          start: '00:00:00,000',
          end: '00:00:01,000',
          text: '竖屏原字幕'
        }]
      },
      createdAt: '2026-09-03T08:00:00.000Z'
    };
    let currentJob = job({
      status: 'completed',
      revision: 4,
      stages: [],
      artifacts: [target, source, vertical],
      state: {
        workspacePhase: 'result',
        resultVersion: 1,
        latestResultVersion: 1,
        resultTab: 'video',
        resultSnapshots: [{
          version: 1,
          createdAt: '2026-09-03T08:00:00.000Z',
          action: 'stage-succeeded',
          stageId: 'subtitle',
          description: '生成字幕',
          artifactRefs: {
            target_subtitle: [target.id],
            source_subtitle: [source.id],
            vertical_subtitle: [vertical.id]
          },
          changedArtifactIds: [target.id, source.id, vertical.id],
          staleArtifactIds: [],
          state: {
            sourceType: 'url',
            sourceUrl: 'https://www.youtube.com/watch?v=job-control',
            sourceLanguage: 'en',
            targetLanguage: 'zh_cn',
            bilingual: true,
            subtitlePosition: 'top',
            preferPlatformCaptions: true,
            dubbing: false,
            voiceCode: '',
            composeVideo: false,
            videoFormat: 'horizontal',
            verticalTitle: '',
            verticalSubtitle: ''
          }
        }]
      }
    });
    const applyAction = vi.fn(async (_jobId: string, request: {
      action: string;
      input: {
        patch?: Record<string, CreatorJson>;
        artifactId?: string;
        cues?: CreatorJson;
        baseResultVersion?: number;
        preserveResultVersion?: boolean;
      };
    }) => {
      if (request.action === 'edit-subtitle') {
        const source = currentJob.artifacts.find(artifact => artifact.id === request.input.artifactId)!;
        const baseResultVersion = request.input.baseResultVersion ?? 1;
        const editedArtifact: CreatorArtifact = {
          ...source,
          id: `${source.id}-edited`,
          version: source.version + 1,
          path: `${source.path}.edited.srt`,
          metadata: {
            ...source.metadata,
            resultVersion: baseResultVersion,
            cues: request.input.cues ?? []
          },
          createdAt: '2026-09-03T09:00:00.000Z'
        };
        currentJob = {
          ...currentJob,
          revision: currentJob.revision + 1,
          artifacts: [...currentJob.artifacts, editedArtifact],
          state: {
            ...currentJob.state,
            resultVersion: baseResultVersion,
            latestResultVersion: baseResultVersion,
            resultSnapshots: readCreatorResultSnapshots(currentJob.state.resultSnapshots).map(snapshot => (
              snapshot.version === baseResultVersion
                ? {
                    ...snapshot,
                    artifactRefs: {
                      ...snapshot.artifactRefs,
                      [source.kind]: [editedArtifact.id]
                    },
                    changedArtifactIds: [...snapshot.changedArtifactIds, editedArtifact.id]
                  }
                : snapshot
            ))
          }
        };
      } else {
        currentJob = {
          ...currentJob,
          revision: currentJob.revision + 1,
          state: request.action === 'update-settings'
            ? { ...currentJob.state, ...(request.input.patch ?? {}) }
            : currentJob.state
        };
      }
      return {
        job: currentJob,
        receipt: {
          actor: 'user' as const,
          action: request.action,
          summary: request.action,
          affectedArtifacts: [],
          newRevision: currentJob.revision,
          createdAt: currentJob.updatedAt
        }
      };
    });

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={currentJob}
          service={{ applyAction, runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    expect(await screen.findByRole('heading', { name: '视频翻译项目' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '字幕' }));
    const horizontal = screen.getByRole('textbox', { name: '横屏字幕 1' });
    fireEvent.change(horizontal, { target: { value: '横屏修改后字幕' } });
    expect(horizontal).toHaveValue('横屏修改后字幕');

    await waitFor(() => expect(applyAction).toHaveBeenCalledWith(
      'job_control',
      expect.objectContaining({
        action: 'update-settings',
        input: expect.objectContaining({
          patch: expect.objectContaining({ resultTab: 'subtitles' })
        })
      })
    ));
    expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('横屏修改后字幕');
    expect(screen.getByRole('button', { name: '保存横屏字幕' })).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: '竖屏' }));
    fireEvent.change(screen.getByRole('textbox', { name: '竖屏字幕 1' }), {
      target: { value: '竖屏修改后字幕' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存竖屏字幕' }));

    await waitFor(() => expect(applyAction).toHaveBeenCalledWith(
      'job_control',
      expect.objectContaining({
        action: 'edit-subtitle',
        input: expect.objectContaining({
          artifactId: vertical.id,
          baseResultVersion: 1,
          preserveResultVersion: true,
          cues: [expect.objectContaining({ text: '竖屏修改后字幕' })]
        })
      })
    ));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '项目 V1' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /字幕/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('radio', { name: '竖屏' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('button', { name: '保存竖屏字幕' })).toBeDisabled();
    });
    expect(screen.getAllByRole('status').some(status => (
      status.textContent?.includes('竖屏字幕已保存，项目仍为 V1')
    ))).toBe(true);
  });

  it('opens an existing project on its persisted completed version', async () => {
    const artifacts = [
      subtitleArtifact(1, '第一版本字幕'),
      subtitleArtifact(2, '第二版本字幕')
    ];
    let currentJob = job({
      status: 'completed',
      revision: 6,
      stages: [],
      artifacts,
      state: {
        currentStep: 1,
        furthestStep: 3,
        workspacePhase: 'configure',
        resultVersion: 1,
        latestResultVersion: 2,
        resultTab: 'settings',
        draftBaseVersion: 1
      }
    });
    const applyAction = vi.fn(async (_jobId: string, request: {
      action: string;
      input: { patch?: Record<string, CreatorJson> };
    }) => {
      currentJob = {
        ...currentJob,
        revision: currentJob.revision + 1,
        state: { ...currentJob.state, ...(request.input.patch ?? {}) }
      };
      return {
        job: currentJob,
        receipt: {
          actor: 'user' as const,
          action: request.action,
          summary: request.action,
          affectedArtifacts: [],
          newRevision: currentJob.revision,
          createdAt: currentJob.updatedAt
        }
      };
    });

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={currentJob}
          service={{ applyAction, runAgentTurn: vi.fn() } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    expect(await screen.findByRole('heading', { name: '视频翻译项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '项目 V1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '作品' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('target-subtitle-v1.srt')).toBeInTheDocument();
    expect(screen.queryByText('正在基于 V1 调整')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '配音' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith(
      'job_control',
      expect.objectContaining({
        input: expect.objectContaining({
          patch: expect.objectContaining({ resultTab: 'voice' })
        })
      })
    ));
    expect(screen.getByRole('tab', { name: '配音' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: '任务设置' }));
    await waitFor(() => expect(applyAction).toHaveBeenCalledWith(
      'job_control',
      expect.objectContaining({
        input: expect.objectContaining({
          patch: expect.objectContaining({ resultTab: 'settings' })
        })
      })
    ));
    expect(screen.getByRole('tab', { name: '任务设置' })).toHaveAttribute('aria-selected', 'true');
  });

  it('confirms cancellation and resumes from the canceled stage', async () => {
    const runningStage = stage({
      id: 'stage_subtitle_1',
      status: 'running',
      dispatchStatus: 'claimed',
      progress: {
        workflow: true,
        percent: 4,
        krillinEventPayload: {
          phase: 'translating_subtitles',
          percent: 4,
          message: '正在翻译字幕'
        }
      }
    });
    const runningJob = job({
      status: 'running',
      revision: 2,
      stages: [runningStage]
    });
    const canceledStage: CreatorStageRun = {
      ...runningStage,
      status: 'canceled',
      dispatchStatus: 'finished',
      progress: { ...runningStage.progress, cancelRequested: true },
      errorCode: 'creator_stage_canceled',
      errorMessage: 'Creator stage was canceled',
      finishedAt: '2026-08-28T06:00:10.000Z'
    };
    const canceledJob = job({
      status: 'canceled',
      revision: 3,
      stages: [canceledStage]
    });
    const resumedStage = stage({
      id: 'stage_subtitle_2',
      status: 'queued',
      dispatchStatus: 'queued',
      progress: {
        workflow: true,
        resumedFromStageRunId: canceledStage.id
      }
    });
    const resumedJob = job({
      status: 'running',
      revision: 4,
      stages: [canceledStage, resumedStage]
    });
    let currentJob = runningJob;
    const applyAction = vi.fn(async (_jobId: string, request: {
      action: string;
      input: { patch?: Record<string, CreatorJson> };
    }) => {
      currentJob = {
        ...currentJob,
        revision: currentJob.revision + 1,
        state: {
          ...currentJob.state,
          ...(request.input.patch ?? {})
        }
      };
      return {
        job: currentJob,
        receipt: {
          actor: 'user' as const,
          action: request.action,
          summary: request.action,
          affectedArtifacts: [],
          newRevision: currentJob.revision,
          createdAt: currentJob.updatedAt
        }
      };
    });
    const cancelJob = vi.fn(async () => {
      currentJob = canceledJob;
      return {
        job: currentJob,
        stage: canceledStage,
        control: 'canceled' as const
      };
    });
    const resumeJob = vi.fn(async () => {
      currentJob = {
        ...resumedJob,
        revision: currentJob.revision + 1
      };
      return {
        job: currentJob,
        stage: resumedStage,
        control: 'resumed' as const
      };
    });

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={runningJob}
          service={{
            applyAction,
            cancelJob,
            resumeJob,
            runAgentTurn: vi.fn()
          } as never}
        >
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    const stopButton = await within(workspace).findByRole('button', { name: '终止任务' });
    expect(stopButton.querySelector('.lucide-square')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByRole('button', { name: '终止字幕翻译' }).querySelector('.lucide-square'))
      .toHaveAttribute('fill', 'currentColor');
    expect(within(workspace).queryByRole('button', { name: '开始翻译' })).not.toBeInTheDocument();

    fireEvent.click(within(workspace).getByRole('button', { name: '终止任务' }));
    const dialog = screen.getByRole('dialog', { name: '终止翻译任务？' });
    expect(within(dialog).getByRole('button', { name: '终止任务' }).querySelector('.lucide-square'))
      .toHaveAttribute('fill', 'currentColor');
    expect(dialog).toHaveTextContent('当前正在执行“字幕翻译”，进度 4%');
    expect(dialog).toHaveTextContent('当前 4% 的阶段内进度不会保留');
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '终止任务' }));

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('job_control'));
    const resumeButton = await within(workspace).findByRole('button', { name: '继续任务' });
    await waitFor(() => expect(resumeButton).toBeEnabled());
    expect(screen.getByRole('button', { name: '继续字幕翻译' })).toBeInTheDocument();
    expect(screen.getByText('已终止，可继续')).toBeInTheDocument();
    expect(screen.getByText('已终止，可继续').closest('[data-status="canceled"]')?.querySelector('.lucide-square'))
      .toHaveAttribute('fill', 'currentColor');

    fireEvent.click(resumeButton);
    await waitFor(() => expect(resumeJob).toHaveBeenCalledWith('job_control'));
    expect(await within(workspace).findByRole('button', { name: '终止任务' })).toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: '开始翻译' })).not.toBeInTheDocument();
  });

  it('clears a start revision conflict after Runtime confirms the stage is active without retrying', async () => {
    let currentSession: ReturnType<typeof useCreatorSession> | undefined;
    let rejectStart: ((reason: unknown) => void) | undefined;
    const initialJob = job({
      status: 'draft',
      revision: 2,
      stages: []
    });
    const runningJob = job({
      status: 'running',
      revision: 3,
      stages: [stage({
        id: 'stage_subtitle_started',
        status: 'running',
        dispatchStatus: 'claimed',
        progress: { workflow: true, percent: 2 }
      })]
    });
    const applyAction = vi.fn((_jobId: string, request: { action: string }) => {
      if (request.action !== 'run-stage') {
        return Promise.resolve({
          job: initialJob,
          receipt: {
            actor: 'user' as const,
            action: request.action,
            summary: request.action,
            affectedArtifacts: [],
            newRevision: initialJob.revision,
            createdAt: initialJob.updatedAt
          }
        });
      }
      return new Promise<never>((_resolve, reject) => {
        rejectStart = reject;
      });
    });
    function SessionCapture() {
      currentSession = useCreatorSession();
      return null;
    }

    render(
      <LanguageProvider initialPreference="zh-CN">
        <CreatorSessionProvider
          initialJob={initialJob}
          service={{ applyAction, runAgentTurn: vi.fn() } as never}
        >
          <SessionCapture />
          <VideoTranslationWorkspace onBack={vi.fn()} />
        </CreatorSessionProvider>
      </LanguageProvider>
    );

    const workspace = screen.getByRole('region', { name: '视频翻译操作区' });
    fireEvent.click(within(workspace).getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(rejectStart).toBeTypeOf('function'));

    act(() => currentSession!.applyRemoteSnapshot(runningJob));
    await act(async () => {
      rejectStart!(Object.assign(new Error('Creator job revision changed'), {
        code: 'creator_revision_conflict'
      }));
    });

    await waitFor(() => {
      expect(screen.queryByText('任务状态刚刚发生变化，请重试一次。你的设置没有丢失。')).not.toBeInTheDocument();
    });
    expect(screen.getByText('翻译任务已开始，进度会实时同步到创作动态')).toBeInTheDocument();
    expect(within(workspace).getByText('翻译进行中')).toBeVisible();
    expect(within(workspace).queryByText('当前项目版本没有作品')).not.toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: '终止任务' })).toBeInTheDocument();
    expect(applyAction.mock.calls.filter(([, request]) => request.action === 'run-stage')).toHaveLength(1);
    act(() => currentSession!.applyRemoteSnapshot(job({
      status: 'completed', revision: 4, artifacts: [subtitleArtifact(1, '翻译完成')],
      stages: [stage({ id: 'stage_subtitle_started', status: 'succeeded', dispatchStatus: 'finished', progress: { resultVersion: 1 } })]
    })));
    expect(within(workspace).queryByText('翻译进行中')).not.toBeInTheDocument();
    expect(within(workspace).queryByText('翻译任务已开始，进度会实时同步到创作动态')).not.toBeInTheDocument();
  });
});

function job(input: {
  status: CreatorJob['status'];
  revision: number;
  stages: CreatorStageRun[];
  templateVersion?: number;
  state?: Record<string, CreatorJson>;
  artifacts?: CreatorArtifact[];
}): CreatorJob {
  return {
    id: 'job_control',
    projectId: 'project_1',
    templateId: 'video-translation',
    templateVersion: input.templateVersion ?? 1,
    status: input.status,
    revision: input.revision,
    presetOrigin: null,
    state: {
      sourceType: 'url',
      sourceUrl: 'https://www.youtube.com/watch?v=job-control',
      sourceLanguage: 'en',
      targetLanguage: 'zh_cn',
      bilingual: true,
      subtitlePosition: 'top',
      preferPlatformCaptions: true,
      subtitleFont: 'system',
      subtitleSize: 'medium',
      subtitleColor: '#FFFFFF',
      dubbing: false,
      voiceCode: '',
      composeVideo: false,
      videoFormat: 'horizontal',
      verticalTitle: '',
      verticalSubtitle: '',
      currentStep: 3,
      furthestStep: 3,
      workspacePhase: 'configure',
      ...input.state
    },
    agentThreadId: null,
    stages: input.stages,
    artifacts: input.artifacts ?? [],
    providerRequests: [],
    activities: [],
    createdAt: '2026-08-28T06:00:00.000Z',
    updatedAt: '2026-08-28T06:00:00.000Z'
  };
}

function subtitleArtifact(resultVersion: number, text: string): CreatorArtifact {
  return {
    id: `target_subtitle_v${resultVersion}`,
    jobId: 'job_control',
    kind: 'target_subtitle',
    version: resultVersion,
    status: 'completed',
    path: `/tmp/target-subtitle-v${resultVersion}.srt`,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {
      resultVersion,
      fileName: `target-subtitle-v${resultVersion}.srt`,
      cues: [{
        id: 1,
        start: '00:00:00,000',
        end: '00:00:01,000',
        text
      }]
    },
    createdAt: `2026-08-28T06:00:0${resultVersion}.000Z`
  };
}

function textSubtitleArtifact(input: {
  id: string;
  kind: 'source_subtitle' | 'bilingual_subtitle';
  version: number;
  fileName: string;
  text: string;
}): CreatorArtifact {
  return {
    id: input.id,
    jobId: 'job_control',
    kind: input.kind,
    version: input.version,
    status: 'completed',
    path: `/tmp/${input.fileName}`,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {
      resultVersion: input.version,
      fileName: input.fileName,
      cues: [{
        id: 1,
        start: '00:00:00,000',
        end: '00:00:01,000',
        text: input.text
      }]
    },
    createdAt: `2026-09-03T07:02:3${input.version}.000Z`
  };
}

function sourceVideoArtifact(resultVersion: number): CreatorArtifact {
  return {
    id: `source_video_v${resultVersion}`,
    jobId: 'job_control',
    kind: 'source_video',
    version: resultVersion,
    status: 'completed',
    path: `/tmp/source-video-v${resultVersion}.mp4`,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {
      resultVersion,
      fileName: `source-video-v${resultVersion}.mp4`,
      width: 1920,
      height: 1080
    },
    createdAt: `2026-08-28T06:00:0${resultVersion}.000Z`
  };
}

function restoreUrlMethod(
  key: 'createObjectURL' | 'revokeObjectURL',
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor === undefined) delete (URL as unknown as Record<string, unknown>)[key];
  else Object.defineProperty(URL, key, descriptor);
}

function stage(input: {
  id: string;
  status: CreatorStageRun['status'];
  dispatchStatus: CreatorStageRun['dispatchStatus'];
  progress: CreatorStageRun['progress'];
}): CreatorStageRun {
  return {
    id: input.id,
    jobId: 'job_control',
    stageId: 'subtitle',
    executor: 'krillinai',
    status: input.status,
    dispatchStatus: input.dispatchStatus,
    claimOwner: input.dispatchStatus === 'claimed' ? 'scheduler_1' : null,
    claimExpiresAt: input.dispatchStatus === 'claimed'
      ? '2026-08-28T06:01:00.000Z'
      : null,
    attempt: input.status === 'queued' ? 0 : 1,
    idempotencyKey: input.id,
    scopeKey: null,
    inputFingerprint: null,
    progress: input.progress,
    errorCode: null,
    errorMessage: null,
    startedAt: input.status === 'queued' ? null : '2026-08-28T06:00:01.000Z',
    finishedAt: null
  };
}
