import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCreatorServicesConfig, type CreatorArtifact, type CreatorJob, type CreatorJson, type CreatorTtsProvider } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { CreatorSessionProvider, useCreatorSession } from './creator-session-store.js';
import { readTranslationContinuation, saveTranslationContinuation } from './video-translation-continuation.js';
import VideoTranslationWorkspace from './VideoTranslationWorkspace.js';

afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); });

function subtitle(id = 'subtitle_1', text = 'Hello'): CreatorArtifact {
  return { id, jobId: 'flow_job', kind: 'target_subtitle', version: 1, status: 'completed', path: '/tmp/translated.srt',
    scopeKey: null, inputFingerprint: null, sha256: null, sourceArtifactIds: [], createdAt: '2026-10-21T00:00:00Z',
    metadata: { resultVersion: 1, fileName: 'translated.srt', cues: [{ id: 1, start: '00:00:00,000', end: '00:00:01,000', text }] } };
}
function initialJob(state: Record<string, CreatorJson> = {}, artifacts = [subtitle()]): CreatorJob {
  const value: CreatorJob = { id: 'flow_job', projectId: 'project_1', templateId: 'video-translation', templateVersion: 2,
    status: artifacts.length ? 'completed' : 'draft', revision: 1, presetOrigin: null, agentThreadId: null,
    state: { sourceType: 'url', sourceUrl: 'https://www.youtube.com/watch?v=flow-test', sourceLanguage: 'en', targetLanguage: 'zh_cn',
      resultVersion: 1, composeVideo: false, dubbing: false, bilingual: true, subtitlePosition: 'top', videoFormat: 'horizontal', ...state },
    stages: [], artifacts, activities: [], providerRequests: [], createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' };
  if (artifacts.length) value.state.resultSnapshots = [{ version: 1, createdAt: value.createdAt, action: 'run-stage', stageId: 'subtitle',
    description: 'Translated subtitles', artifactRefs: { target_subtitle: [artifacts[0]!.id] }, changedArtifactIds: [artifacts[0]!.id], staleArtifactIds: [], state: { ...value.state } }];
  return value;
}
function mount(initial = initialJob(), beforeAction?: (action: string) => Promise<void>, services = configuredSpeech()) {
  let current = initial;
  const applyAction = vi.fn(async (_id: string, request: { action: string; input: Record<string, CreatorJson> }) => {
    await beforeAction?.(request.action);
    current = { ...current, revision: current.revision + 1 };
    if (request.action === 'update-settings') current.state = { ...current.state, ...request.input.patch as object };
    if (request.action === 'select-result-version') current.state = { ...current.state, resultVersion: request.input.version! };
    if (request.action === 'edit-subtitle') {
      const target = current.artifacts.find(artifact => artifact.id === request.input.artifactId)!;
      current.artifacts = current.artifacts.map(artifact => artifact.id === target.id ? { ...artifact, metadata: { ...artifact.metadata, cues: request.input.cues! } } : artifact);
    }
    return { job: current };
  });
  const onBack = vi.fn();
  let push!: (job: CreatorJob) => void;
  function Remote() { push = useCreatorSession().applyRemoteSnapshot; return null; }
  const view = render(<StrictMode><LanguageProvider initialPreference="zh-CN"><CreatorSessionProvider initialJob={initial} service={{ applyAction, runAgentTurn: vi.fn() } as never}>
    <Remote /><VideoTranslationWorkspace onBack={onBack} creatorServicesService={services as never} />
  </CreatorSessionProvider></LanguageProvider></StrictMode>);
  return { unmount: view.unmount, applyAction, onBack, current: () => current, push: (value: CreatorJob) => { current = value; push(value); } };
}
function stageCalls(applyAction: ReturnType<typeof mount>['applyAction']) {
  return applyAction.mock.calls.map(([, request]) => request).filter(request => request.action === 'run-stage');
}

function configuredSpeech() {
  const config = createDefaultCreatorServicesConfig(); config.tts.openai.apiKey = 'configured';
  config.tts.openai.defaultVoiceId = 'alloy';
  return { getConfig: vi.fn(async () => ({ config, configuredCredentials: ['tts.openai.apiKey'] })),
    getCapabilities: vi.fn(async () => ({ transcription: { providers: [] } })),
    getTtsVoices: vi.fn(async (provider: CreatorTtsProvider, _model?: string) => ({ voices: (provider === 'aliyun'
      ? [{ id: 'Cherry', name: '芊悦' }, { id: 'Serena', name: '苏瑶' }]
      : [{ id: 'alloy', name: 'Alloy' }, { id: 'echo', name: 'Echo' }]).map(voice => ({ ...voice, provider, kind: 'builtin' as const })) })), previewTtsVoice: vi.fn() };
}

describe('video translation two-step flow', () => {
  it('shows immediate submission feedback and prevents repeated composition requests', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const session = mount(initialJob(), action => action === 'run-stage' ? pending : Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: '合成视频' }));
    await waitFor(() => expect(stageCalls(session.applyAction)).toHaveLength(1));
    const bar = screen.getByRole('region', { name: '当前任务进度' });
    expect(bar).toHaveTextContent('正在启动任务');
    expect(within(bar).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByRole('button', { name: '正在启动任务' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '正在启动任务' }));
    expect(stageCalls(session.applyAction)).toHaveLength(1);
    await act(async () => finish());
  });

  it('shows recovered dubbing progress with the assistant closed and opens it from details', async () => {
    const initial = initialJob({ composeVideo: true, dubbing: true });
    initial.status = 'running';
    initial.stages = [{ id: 'running_tts', jobId: initial.id, stageId: 'tts', executor: 'test', status: 'running', dispatchStatus: 'claimed',
      claimOwner: null, claimExpiresAt: null, attempt: 1, idempotencyKey: null, scopeKey: null, inputFingerprint: null,
      progress: { workflow: true, baseResultVersion: 1, inputResultVersion: 1, phase: 'generating_voice', percent: 29, completed: 12, total: 41 },
      errorCode: null, errorMessage: null, startedAt: initial.createdAt, finishedAt: null }];
    const session = mount(initial);
    const bar = screen.getByRole('region', { name: '当前任务进度' });
    expect(bar).toHaveTextContent('已完成 12 / 41 段');
    expect(bar).toHaveTextContent('V2');
    expect(within(bar).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '29');
    expect(screen.getByRole('button', { name: 'AI 助手' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(bar).getByRole('button', { name: '查看详情' }));
    expect(screen.getByRole('button', { name: 'AI 助手' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(bar).getByRole('button', { name: '查看详情' }));
    expect(screen.getByRole('button', { name: 'AI 助手' })).toHaveAttribute('aria-pressed', 'true');
    expect(stageCalls(session.applyAction)).toHaveLength(0);
  });

  it('uses current global speech settings for first dubbing despite saved task defaults, including immediate output', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    response.config.tts.provider = 'aliyun';
    response.config.tts.aliyun.apiKey = 'configured';
    response.config.tts.aliyun.model = 'qwen3-tts-flash';
    response.config.tts.aliyun.defaultVoiceId = 'Cherry';
    response.configuredCredentials = ['tts.aliyun.apiKey'];
    const initial = initialJob({ ttsProvider: 'openai', ttsModel: 'gpt-4o-mini-tts', voiceCode: 'marin', voiceName: 'Marin' });
    const originalSnapshots = JSON.stringify(initial.state.resultSnapshots);
    const session = mount(initial, undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    fireEvent.click(screen.getByRole('button', { name: '配音并合成视频' }));
    await waitFor(() => expect(stageCalls(session.applyAction)).toHaveLength(1));
    expect(session.current().state).toMatchObject({ ttsProvider: 'aliyun', ttsModel: 'qwen3-tts-flash', voiceCode: 'Cherry' });
    expect(screen.getByText('阿里云百炼')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'Cherry');
    expect(JSON.stringify(session.current().state.resultSnapshots)).toBe(originalSnapshots);
    expect(services.getTtsVoices).toHaveBeenLastCalledWith('aliyun', 'qwen3-tts-flash');
  });

  it('preserves generated speech settings on focus until explicitly adopting current settings', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    response.config.tts.provider = 'aliyun';
    response.config.tts.aliyun.apiKey = 'configured';
    response.config.tts.aliyun.defaultVoiceId = 'Cherry';
    response.configuredCredentials.push('tts.aliyun.apiKey');
    const voice: CreatorArtifact = { ...subtitle('voice_1'), kind: 'dubbed_audio', path: '/tmp/voice.mp3', metadata: { resultVersion: 1 } };
    const initial = initialJob({ dubbing: true, ttsProvider: 'openai', ttsModel: 'tts-1-hd', voiceCode: 'echo', voiceName: 'Echo' }, [subtitle(), voice]);
    const snapshots = initial.state.resultSnapshots as Array<Record<string, CreatorJson>>;
    (snapshots[0]!.artifactRefs as Record<string, CreatorJson>).dubbed_audio = [voice.id];
    const originalSnapshots = JSON.stringify(snapshots);
    const session = mount(initial, undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'echo'));
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(screen.getByText('OpenAI TTS')).toBeVisible();
    expect(screen.getByText('tts-1-hd')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'echo');
    fireEvent.click(screen.getByRole('button', { name: '使用当前设置' }));
    await waitFor(() => expect(screen.getByText('阿里云百炼')).toBeVisible());
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'Cherry');
    fireEvent.click(screen.getByRole('button', { name: '配音并合成视频' }));
    await waitFor(() => expect(stageCalls(session.applyAction)).toHaveLength(1));
    expect(stageCalls(session.applyAction)[0]!.input.stageId).toBe('tts');
    expect(session.current().state).toMatchObject({ ttsProvider: 'aliyun', voiceCode: 'Cherry' });
    expect(JSON.stringify(session.current().state.resultSnapshots)).toBe(originalSnapshots);
  });

  it('keeps task voice choices on ordinary focus and refreshes changed global model and voice together', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    const session = mount(initialJob({ dubbing: true }), undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    const picker = screen.getByRole('combobox', { name: '配音音色' });
    await waitFor(() => expect(picker).toBeEnabled());
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole('option', { name: /Echo/ }));
    await waitFor(() => expect(session.current().state.voiceCode).toBe('echo'));
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(picker).toHaveAttribute('data-value', 'echo');
    response.config.tts.openai.model = 'tts-1-hd';
    response.config.tts.openai.defaultVoiceId = 'alloy';
    await act(async () => { fireEvent(window, new Event('focus')); });
    await waitFor(() => expect(picker).toHaveAttribute('data-value', 'alloy'));
    expect(screen.getByText('tts-1-hd')).toBeVisible();
    response.config.tts.provider = 'aliyun';
    response.config.tts.aliyun.apiKey = 'configured';
    response.config.tts.aliyun.defaultVoiceId = 'Serena';
    await act(async () => { fireEvent(window, new Event('focus')); });
    await waitFor(() => expect(picker).toHaveAttribute('data-value', 'Serena'));
    expect(screen.getByText('阿里云百炼')).toBeVisible();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
  });

  it('preserves a manually selected task voice after reopening and resets it when adopting current settings', async () => {
    const services = configuredSpeech();
    const first = mount(initialJob({ dubbing: true }), undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    const picker = screen.getByRole('combobox', { name: '配音音色' });
    await waitFor(() => expect(picker).toBeEnabled());
    fireEvent.click(picker);
    fireEvent.click(await screen.findByRole('option', { name: /Echo/ }));
    await waitFor(() => expect(first.current().state.voiceCode).toBe('echo'));
    const saved = first.current();
    first.unmount();
    const reopened = mount(saved, undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'echo');
    fireEvent.click(screen.getByRole('button', { name: '使用当前设置' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'alloy'));
    await waitFor(() => expect(reopened.current().state.ttsVoiceSelection).toBeNull());
    expect(stageCalls(reopened.applyAction)).toHaveLength(0);
  });

  it('ignores an older focus response and clears the previous provider voice when switching to Edge TTS', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    const session = mount(initialJob({ dubbing: true }), undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'alloy'));
    let finish!: (value: typeof response) => void;
    const pending = new Promise<typeof response>(resolve => { finish = resolve; });
    services.getConfig.mockImplementation(() => pending);
    await act(async () => { fireEvent(window, new Event('focus')); });
    const updated = structuredClone(response);
    updated.config.tts.provider = 'edge-tts';
    services.getConfig.mockResolvedValue(updated);
    await act(async () => { fireEvent(window, new Event('focus')); });
    await waitFor(() => expect(screen.getByText('Edge TTS')).toBeVisible());
    await act(async () => { finish(response); });
    expect(screen.getByText('Edge TTS')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', '');
    await waitFor(() => expect(session.current().state).toMatchObject({ ttsProvider: 'edge-tts', ttsModel: '', voiceCode: '' }));
  });

  it('restores historical model and voice when switching back from a subtitle-only version', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    response.config.tts.provider = 'aliyun';
    response.config.tts.aliyun.defaultVoiceId = 'Cherry';
    const voice: CreatorArtifact = { ...subtitle('voice_1'), kind: 'dubbed_audio', metadata: { resultVersion: 1 } };
    const second = { ...subtitle('subtitle_2', 'Second version'), version: 2, metadata: { ...subtitle().metadata, resultVersion: 2 } };
    const initial = initialJob({ dubbing: true, ttsProvider: 'openai', ttsModel: 'tts-1-hd', voiceCode: 'echo', voiceName: 'Echo' }, [subtitle(), voice, second]);
    const snapshots = initial.state.resultSnapshots as Array<Record<string, CreatorJson>>;
    (snapshots[0]!.artifactRefs as Record<string, CreatorJson>).dubbed_audio = [voice.id];
    snapshots.push({ version: 2, action: 'run-stage', stageId: 'subtitle', createdAt: initial.createdAt, description: 'Second version',
      artifactRefs: { target_subtitle: [second.id] }, changedArtifactIds: [second.id], staleArtifactIds: [], state: { ...initial.state, resultSnapshots: [], resultVersion: 2 } });
    const original = JSON.stringify(snapshots);
    const session = mount(initial, undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    await waitFor(() => expect(screen.getByText('tts-1-hd')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: '历史版本' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /项目 V2/ }));
    await waitFor(() => expect(screen.getByText('阿里云百炼')).toBeVisible());
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'Cherry');
    fireEvent.click(screen.getByRole('button', { name: '历史版本' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /项目 V1/ }));
    await waitFor(() => expect(screen.getByText('tts-1-hd')).toBeVisible());
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'echo');
    expect(JSON.stringify(session.current().state.resultSnapshots)).toBe(original);
  });

  it('does not refresh speech settings while composition is being submitted', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const session = mount(initialJob({ dubbing: true }), async action => { if (action === 'run-stage') await pending; }, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'alloy'));
    fireEvent.click(screen.getByRole('button', { name: '配音并合成视频' }));
    await waitFor(() => expect(stageCalls(session.applyAction)).toHaveLength(1));
    response.config.tts.provider = 'aliyun';
    await act(async () => { fireEvent(window, new Event('focus')); });
    expect(screen.getByText('OpenAI TTS')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '配音音色' })).toHaveAttribute('data-value', 'alloy');
    await act(async () => { finish(); });
    expect(session.current().state.ttsProvider).toBe('openai');
  });

  it('downloads by default and persists the explicit opt-out before starting subtitles', async () => {
    const session = mount(initialJob({ currentStep: 1 }, []));
    const toggle = screen.getByRole('switch', { name: '暂不下载原视频' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole('region', { name: '视频翻译操作区' })).getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(stageCalls(session.applyAction)).toHaveLength(1));
    expect(session.current().state.skipVideoDownload).toBe(true);
    expect(stageCalls(session.applyAction)[0]!.input.stageId).toBe('subtitle');
  });

  it.each([42, null])('shows inline download progress (%s) while saving subtitle edits and allowing style changes', async percent => {
    const initial = initialJob();
    initial.stages = [{ id: 'source_download', jobId: initial.id, stageId: 'preview-source-video', executor: 'download',
      status: 'running', dispatchStatus: 'claimed', claimOwner: 'scheduler', claimExpiresAt: null, attempt: 1,
      idempotencyKey: null, scopeKey: null, inputFingerprint: null, errorCode: null, errorMessage: null,
      startedAt: initial.createdAt, finishedAt: null,
      progress: { backgroundSourceDownload: true, previewSourceUrl: initial.state.sourceUrl!, phase: 'downloading', percent,
        downloadedBytes: 42 * 1024 ** 2, totalBytes: percent === null ? null : 100 * 1024 ** 2,
        bytesPerSecond: 2 * 1024 ** 2, remainingSeconds: 29 } }];
    const session = mount(initial);
    const preview = within(screen.getByRole('region', { name: '同步视频预览' }));
    const progress = preview.getByRole('progressbar', { name: '原视频下载进度' });
    if (percent === null) expect(progress).not.toHaveAttribute('aria-valuenow');
    else expect(progress).toHaveAttribute('aria-valuenow', '42');
    expect(preview.getByText(/42.0 MiB.*2.0 MiB\/s/)).toBeVisible();
    const editor = screen.getByRole('textbox', { name: '横屏字幕 1' });
    fireEvent.change(editor, { target: { value: 'Edited during download' } });
    await waitFor(() => expect(session.applyAction.mock.calls.some(([, request]) => request.action === 'edit-subtitle')).toBe(true));
    expect(screen.getByRole('radio', { name: '电影感' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '合成视频' })).toBeDisabled();
    await act(async () => session.push({ ...session.current(), revision: 50,
      stages: [{ ...initial.stages[0]!, status: 'failed', errorMessage: 'Network failed' }] }));
    expect(preview.getByRole('button', { name: '重试下载原视频' })).toBeEnabled();
    expect(editor).toHaveValue('Edited during download');
  });

  it('saves subtitles and the editor context before configuration, then resumes combined output exactly once', async () => {
    const services = configuredSpeech();
    const response = await services.getConfig(); response.config.tts.openai.apiKey = ''; response.configuredCredentials = [];
    services.getConfig.mockResolvedValue(response);
    const first = mount(initialJob(), undefined, services);
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    fireEvent.click(screen.getByRole('button', { name: '配音并合成视频' }));
    const configure = await screen.findByRole('button', { name: '去配置配音服务' });
    expect(stageCalls(first.applyAction)).toHaveLength(0);
    fireEvent.change(screen.getByRole('textbox', { name: '横屏字幕 1' }), { target: { value: 'Manual correction before setup' } });
    fireEvent.click(configure);
    await waitFor(() => expect(readTranslationContinuation()?.status).toBe('configure'));
    expect(readTranslationContinuation()).toMatchObject({ jobId: 'flow_job', version: 1, editor: { panel: 'voice' } });
    expect(window.location.hash).toContain('returnPath=');
    const saved = first.current(); first.unmount();
    saveTranslationContinuation({ ...readTranslationContinuation()!, status: 'ready' });
    const updatedServices = configuredSpeech();
    const updated = await updatedServices.getConfig();
    updated.config.tts.provider = 'aliyun';
    updated.config.tts.aliyun.apiKey = 'configured';
    updated.config.tts.aliyun.defaultVoiceId = 'Serena';
    updated.configuredCredentials = ['tts.aliyun.apiKey'];
    const returned = mount(saved, undefined, updatedServices);
    await waitFor(() => expect(stageCalls(returned.applyAction)).toHaveLength(1));
    expect(stageCalls(returned.applyAction)[0]!.input).toMatchObject({ stageId: 'tts', workflow: true, inputResultVersion: 1 });
    expect(returned.current().state).toMatchObject({ composeVideo: true, dubbing: true, ttsProvider: 'aliyun', voiceCode: 'Serena' });
    expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('Manual correction before setup');
    expect(screen.getByRole('complementary', { name: '配音' })).toBeVisible();
    expect(readTranslationContinuation()).toBeUndefined();
  });

  it('migrates old final-step drafts to language selection and starts with subtitles only', async () => {
    const session = mount(initialJob({ currentStep: 3, furthestStep: 3, composeVideo: true, dubbing: true }, []));
    const workspace = within(screen.getByRole('region', { name: '视频翻译操作区' }));
    expect(workspace.getByRole('navigation', { name: '翻译流程' }).querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '设置翻译语言' })).toBeVisible();
    expect(screen.queryByRole('switch', { name: '合成字幕视频' })).not.toBeInTheDocument();
    fireEvent.click(workspace.getByRole('button', { name: '开始翻译' }));
    await waitFor(() => expect(stageCalls(session.applyAction), document.body.textContent ?? '').toHaveLength(1));
    expect(session.current().state).toMatchObject({ composeVideo: false, dubbing: false });
    expect(stageCalls(session.applyAction)[0]!.input).toMatchObject({ stageId: 'subtitle', workflow: true });
  });

  it('opens completed subtitles with a full-width timeline and preserves settings when collapsing the sidebar', async () => {
    const session = mount();
    expect(screen.getByRole('heading', { name: '视频翻译工作区' })).toBeVisible();
    expect(document.querySelector('main')).toHaveAttribute('data-subtitle-immersive', 'true');
    expect(screen.getByRole('textbox', { name: '横屏字幕 1' })).toHaveValue('Hello');
    expect(screen.getByRole('button', { name: '字幕样式' })).toBeVisible();
    const panel = screen.getByRole('complementary', { name: '字幕样式' });
    expect(panel).toBeVisible();
    expect(within(panel).getByRole('button', { name: '合成视频' })).toBeVisible();
    const timeline = screen.getByRole('region', { name: '字幕时间轴' });
    expect(timeline.parentElement).toBe(panel.parentElement);
    expect(screen.getByRole('button', { name: '收起时间轴' })).toHaveAttribute('aria-expanded', 'true');
    expect(panel.querySelector('footer')).toBeNull();
    const settingsBody = panel.querySelector('.subtitle-editor-settings-body')!;
    settingsBody.scrollTop = 120;
    fireEvent.click(screen.getByRole('button', { name: '收起设置' }));
    expect(screen.queryByRole('complementary', { name: '字幕样式' })).toBeNull();
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '字幕时间轴' })).toBe(timeline);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '展开设置' })); });
    expect(screen.getByRole('complementary', { name: '字幕样式' })).toBe(panel);
    expect(settingsBody.scrollTop).toBe(120);
    expect(screen.getByRole('region', { name: '字幕时间轴' })).toBe(timeline);
    expect(screen.queryByRole('button', { name: '深度编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存字幕' })).not.toBeInTheDocument();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
  });

  it('enters the work area when subtitles arrive and leaves preview preparation optional', async () => {
    const initial = initialJob({}, []);
    initial.status = 'running';
    const session = mount(initial);
    await act(async () => { session.push({ ...initialJob(), revision: 10 }); });
    expect(document.querySelector('main')).toHaveAttribute('data-subtitle-immersive', 'true');
    expect(screen.getByRole('button', { name: '下载原视频并预览' })).toBeVisible();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
  });

  it('keeps subtitle-only work free of video settings', () => {
    mount(initialJob({ sourceType: 'subtitle' }));
    expect(screen.getByRole('heading', { name: '字幕翻译工作区' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '合成视频' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '同步视频预览' })).not.toBeInTheDocument();
  });

  it('does not enable rendering when choosing a style and composes with one explicit action', async () => {
    const session = mount();
    fireEvent.click(screen.getByRole('button', { name: '字幕样式' }));
    const settings = within(screen.getByRole('complementary', { name: '字幕样式' }));
    fireEvent.click(settings.getByRole('radio', { name: '电影感' }));
    expect(session.current().state.composeVideo).toBe(false);
    expect(stageCalls(session.applyAction)).toHaveLength(0);
    fireEvent.click(settings.getByRole('button', { name: '合成视频' }));
    expect(stageCalls(session.applyAction)).toHaveLength(0);
    await waitFor(() => expect(stageCalls(session.applyAction), document.body.textContent ?? '').toHaveLength(1));
    expect(stageCalls(session.applyAction)[0]!.input).toMatchObject({ stageId: 'render-horizontal', workflow: true, inputResultVersion: 1 });
    expect(document.querySelector('main')).toHaveAttribute('data-subtitle-immersive', 'true');
  });

  it('generates dubbing and chains video composition in one action', async () => {
    const session = mount();
    fireEvent.click(screen.getByRole('button', { name: '配音' }));
    const settings = within(screen.getByRole('complementary', { name: '配音' }));
    fireEvent.click(settings.getByRole('switch', { name: '启用配音' }));
    expect(screen.queryByRole('switch', { name: '合成字幕视频' })).not.toBeInTheDocument();
    fireEvent.click(settings.getByRole('button', { name: '配音并合成视频' }));
    await waitFor(() => expect(stageCalls(session.applyAction), document.body.textContent ?? '').toHaveLength(1));
    expect(session.current().state).toMatchObject({ dubbing: true, composeVideo: true });
    expect(stageCalls(session.applyAction)[0]!.input).toMatchObject({ stageId: 'tts', workflow: true, inputResultVersion: 1 });
  });

  it('warns about manual edits before retranslating and waits for confirmation', async () => {
    const session = mount();
    fireEvent.click(screen.getByRole('button', { name: '任务设置' }));
    const settings = within(screen.getByRole('complementary', { name: '任务设置' }));
    fireEvent.change(settings.getByRole('combobox', { name: '翻译为' }), { target: { value: 'de' } });
    fireEvent.click(settings.getByRole('button', { name: '重新翻译字幕' }));
    expect(screen.getByText(/人工修改保留在历史版本/)).toBeVisible();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
    fireEvent.click(settings.getByRole('button', { name: '确认重新翻译字幕' }));
    await waitFor(() => expect(stageCalls(session.applyAction)[0]!.input.stageId).toBe('subtitle'));
  });

  it('debounces subtitle saves and preserves typing while a save is in flight', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let saves = 0;
    const session = mount(undefined, async action => { if (action === 'edit-subtitle' && ++saves === 1) await pending; });
    vi.useFakeTimers();
    const editor = screen.getByRole('textbox', { name: '横屏字幕 1' });
    fireEvent.change(editor, { target: { value: 'First edit' } });
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(screen.getByText(/保存中/)).toBeVisible();
    expect(editor).not.toHaveAttribute('readonly');
    fireEvent.change(editor, { target: { value: 'Newer edit' } });
    await act(async () => { release(); });
    expect(editor).toHaveValue('Newer edit');
    await act(async () => { vi.advanceTimersByTime(900); });
    const edits = session.applyAction.mock.calls.map(([, request]) => request).filter(request => request.action === 'edit-subtitle');
    expect(edits).toHaveLength(2);
    expect(edits[0]!.input.cues).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'First edit' })]));
    expect(edits[1]!.input.cues).toEqual(expect.arrayContaining([expect.objectContaining({ text: 'Newer edit' })]));
    expect(screen.getByText(/已保存/)).toBeVisible();
  });

  it('keeps failed edits visible, blocks version switching, and retries saving explicitly', async () => {
    let fail = true;
    const session = mount(undefined, async action => { if (action === 'edit-subtitle' && fail) throw new Error('Save unavailable'); });
    vi.useFakeTimers();
    const editor = screen.getByRole('textbox', { name: '横屏字幕 1' });
    fireEvent.change(editor, { target: { value: 'Keep this draft' } });
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(editor).toHaveValue('Keep this draft');
    expect(screen.getByText(/保存失败/)).toBeVisible();
    expect(screen.getByRole('button', { name: '历史版本' })).toBeDisabled();
    fail = false;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试保存' })); });
    expect(screen.queryByRole('button', { name: '重试保存' })).not.toBeInTheDocument();
    expect(screen.getByText(/已保存/)).toBeVisible();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
  });

  it('waits for edits made during confirmation to save before retranslating', async () => {
    const session = mount();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '任务设置' }));
    const settings = within(screen.getByRole('complementary', { name: '任务设置' }));
    fireEvent.change(settings.getByRole('combobox', { name: '翻译为' }), { target: { value: 'de' } });
    fireEvent.click(settings.getByRole('button', { name: '重新翻译字幕' }));
    fireEvent.change(screen.getByRole('textbox', { name: '横屏字幕 1' }), { target: { value: 'Keep my manual correction' } });
    expect(settings.getByRole('button', { name: '确认重新翻译字幕' })).toBeDisabled();
    expect(stageCalls(session.applyAction)).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(900); });
    expect(settings.getByRole('button', { name: '确认重新翻译字幕' })).toBeEnabled();
    await act(async () => { fireEvent.click(settings.getByRole('button', { name: '确认重新翻译字幕' })); });
    expect(stageCalls(session.applyAction)).toHaveLength(1);
    expect(session.current().artifacts[0]!.metadata.cues).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Keep my manual correction' })
    ]));
  });

  it.each([
    { sourceType: 'subtitle', fail: false }, { sourceType: 'subtitle', fail: true },
    { sourceType: 'url', fail: false }, { sourceType: 'url', fail: true }
  ])('saves before returning and keeps the editor open on save failure: $sourceType/$fail', async ({ sourceType, fail }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const session = mount(initialJob({ sourceType }), async action => {
      if (action === 'edit-subtitle') { await pending; if (fail) throw new Error('Save unavailable'); }
    });
    const editor = screen.getByRole('textbox', { name: sourceType === 'subtitle' ? '字幕 1' : '横屏字幕 1' });
    fireEvent.change(editor, { target: { value: 'Save before leaving' } });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('region', { name: '视频翻译项目产出' })).getByRole('button', { name: '返回' }));
    });
    expect(session.onBack).not.toHaveBeenCalled();
    expect(editor).toHaveAttribute('readonly');
    await act(async () => { release(); });
    if (fail) {
      expect(session.onBack).not.toHaveBeenCalled();
      expect(editor).toHaveValue('Save before leaving');
      expect(editor).not.toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: '重试保存' })).toBeVisible();
    } else {
      if (sourceType === 'subtitle') expect(session.onBack).toHaveBeenCalledOnce();
      else {
        expect(session.onBack).not.toHaveBeenCalled();
        expect(screen.getByRole('tab', { name: '作品' })).toHaveAttribute('aria-selected', 'true');
        expect(document.querySelector('main')).not.toHaveAttribute('data-subtitle-immersive');
      }
      expect(session.current().artifacts[0]!.metadata.cues).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'Save before leaving' })
      ]));
    }
  });

});
