import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  CreatorActionRequest,
  CreatorArtifact,
  CreatorJob,
  CreatorJson,
  GatewayAccountState
} from '@opencreator/protocol';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import ImageGenerationWorkspace from './ImageGenerationWorkspace.js';
import { CreatorSessionProvider, useOptionalCreatorSession, type CreatorSessionContextValue } from './creator-session-store.js';
import { OfficialServicesContext } from './official-services.js';

describe('ImageGenerationWorkspace', () => {
  it('uses official image metadata and constrains candidate count to the selected model', async () => {
    const fixture = createFixture();
    const state: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@test', verified: true }, bindingVersion: '1', models: [{ id: 'vendor/image', modality: 'image', capabilities: [], imageOptions: { aspectRatios: ['16:9', '9:16'], resolutions: ['1K', '2K'], qualities: ['standard', 'hd'], outputFormats: ['jpeg'], maxImages: 1, maxReferences: 0 } }], activationError: null };
    renderWorkspace(fixture, { ...fixture.currentJob(), state: { prompt: 'city', currentStep: 1, furthestStep: 1 } }, { getConfig: vi.fn() }, state);
    expect(screen.getByRole('combobox', { name: '图片画幅' })).toHaveValue('16:9');
    expect(within(screen.getByRole('combobox', { name: '图片质量' })).getAllByRole('option').map(option => option.textContent)).toEqual(['标准', '高清']);
    fireEvent.change(screen.getByRole('combobox', { name: '分辨率' }), { target: { value: '2K' } });
    fireEvent.change(screen.getByRole('combobox', { name: '图片质量' }), { target: { value: 'hd' } });
    expect(screen.queryByRole('radio', { name: '4 张' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 张' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(fixture.applyAction).toHaveBeenCalled());
    const update = fixture.applyAction.mock.calls.find(([, request]) => request.action === 'update-settings');
    expect(update?.[1].input.patch).toMatchObject({ aspectRatio: '16:9', resolution: '2K', officialQuality: 'hd', candidateCount: 1 });
  });
  it('allows only official image choices and submits the task choice without changing defaults', async () => {
    const fixture = createFixture();
    const state: GatewayAccountState = { source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: 'a:1', selectedModels: { image: 'official/first' }, models: [{ id: 'official/first', modality: 'image', capabilities: [] }, { id: 'official/second', modality: 'image', capabilities: ['edit'] }], activationError: null };
    const getConfig = vi.fn();
    renderWorkspace(fixture, { ...fixture.currentJob(), state: { prompt: 'city skyline', provider: 'codex-native', currentStep: 1, furthestStep: 1 } }, { getConfig }, state);
    const model = screen.getByRole('combobox', { name: '图片模型' });
    fireEvent.click(model);
    expect(within(screen.getByRole('listbox', { name: '图片模型' })).getAllByRole('option').map(option => option.getAttribute('aria-label'))).toEqual(['first', 'second']);
    expect(screen.queryByRole('combobox', { name: '图像服务' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'second' }));
    await waitFor(() => expect(model).toHaveValue('second'));
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(fixture.applyAction).toHaveBeenCalledWith('creator_job_image_ui', expect.objectContaining({ action: 'run-stage', input: { stageId: 'generate' } })));
    const update = fixture.applyAction.mock.calls.find(([, request]) => request.action === 'update-settings');
    expect(update?.[1].input.patch).toMatchObject({ provider: 'openai', officialModels: { image: 'official/second' } });
    expect(state.selectedModels?.image).toBe('official/first');
    expect(getConfig).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:image-generation-reference')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    });
  });

  it('validates and submits prompt and settings directly without persisting wizard steps', async () => {
    const fixture = createFixture();
    renderWorkspace(fixture);
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请先描述需要生成的画面');
    expect(fixture.applyAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), { target: { value: '  A coastal landscape  ' } });
    fireEvent.change(screen.getByRole('combobox', { name: '图片画幅' }), { target: { value: '1536x1024' } });
    fireEvent.change(screen.getByRole('combobox', { name: '图片质量' }), { target: { value: 'high' } });
    fireEvent.click(screen.getByRole('radio', { name: '4 张' }));
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(fixture.applyAction).toHaveBeenCalledWith('creator_job_image_ui', expect.objectContaining({ action: 'run-stage' })));
    const updates = fixture.applyAction.mock.calls.filter(([, request]) => request.action === 'update-settings');
    expect(updates.at(-1)?.[1].input.patch).toMatchObject({ prompt: 'A coastal landscape', size: '1536x1024', quality: 'high', candidateCount: 4 });
    for (const [, request] of updates) {
      expect(request.input.patch).not.toHaveProperty('currentStep');
      expect(request.input.patch).not.toHaveProperty('furthestStep');
    }
  });

  it('previews, removes and reselects the same reference file in the single form', async () => {
    const fixture = createFixture();
    renderWorkspace(fixture);
    const input = screen.getByLabelText('上传图像生成参考图');
    const image = new File([png('reference')], 'reference.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [image] } });
    expect(await screen.findByRole('img', { name: '图像生成参考图' })).toBeVisible();
    expect(document.querySelector('.image-generation-reference')).toHaveTextContent('reference.png');
    expect(document.querySelector('.image-generation-reference')).toHaveTextContent('1/1');
    fireEvent.click(screen.getByRole('button', { name: '移除参考图' }));
    expect(screen.queryByRole('img', { name: '图像生成参考图' })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { files: [image] } });
    expect(await screen.findByRole('img', { name: '图像生成参考图' })).toBeVisible();
    expect(input).toHaveValue('');
  });

  it('prevents duplicate submissions and settings changes while a reference uploads', async () => {
    const fixture = createFixture();
    let release!: () => void;
    const pendingUpload = new Promise<void>(resolve => { release = resolve; });
    const upload = fixture.uploadReferenceImage.getMockImplementation()!;
    fixture.uploadReferenceImage.mockImplementationOnce(async (...args) => {
      await pendingUpload;
      return upload(...args);
    });
    renderWorkspace(fixture);
    const form = screen.getByRole('form', { name: '图像生成' });
    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), { target: { value: 'A landscape' } });
    fireEvent.change(screen.getByLabelText('上传图像生成参考图'), {
      target: { files: [new File([png('reference')], 'reference.png', { type: 'image/png' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(fixture.uploadReferenceImage).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: '提示词' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '正在生成' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '图片质量' })).toBeDisabled();
    fireEvent.submit(form);
    await act(async () => { release(); });
    await waitFor(() => expect(fixture.applyAction.mock.calls.filter(([, request]) => request.action === 'run-stage')).toHaveLength(1));
    expect(fixture.uploadReferenceImage).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '开始生成' })).toBeEnabled();
  });

  it.each([
    { language: 'zh-CN' as const, form: '图像生成', prompt: '提示词', format: '图片画幅', generate: '开始生成', clear: '清空提示词', summary: '任务摘要' },
    { language: 'en-US' as const, form: 'Image Generation', prompt: 'Prompt', format: 'Image format', generate: 'Generate', clear: 'Clear prompt', summary: 'Task summary' },
    { language: 'sv-SE' as const, form: 'Bildgenerering', prompt: 'Prompt', format: 'Bildformat', generate: 'Generera', clear: 'Rensa prompt', summary: 'Uppgiftssammanfattning' }
  ])('localizes the single-page controls and task summary in $language', copy => {
    const fixture = createFixture();
    renderWorkspace(fixture, fixture.currentJob(), undefined, undefined, copy.language);
    const form = screen.getByRole('form', { name: copy.form });
    expect(within(form).getByRole('textbox', { name: copy.prompt })).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: copy.format })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: copy.generate })).toBeEnabled();
    expect(within(form).getByRole('button', { name: copy.clear })).toBeDisabled();
    expect(within(screen.getByRole('complementary', { name: 'OpenCreator' })).getByRole('complementary', { name: copy.summary })).toBeInTheDocument();
  });

  it('places model selection before the editor and the reference banner above the prompt', () => {
    const fixture = createFixture({ pending: true });
    renderWorkspace(fixture);
    const workspace = screen.getByRole('region', { name: '图像生成 操作区' });
    const prompt = within(workspace).getByRole('textbox', { name: '提示词' });
    const referenceUpload = within(workspace).getByLabelText('上传图像生成参考图');
    const editor = prompt.closest('.image-generation-editor');
    const model = within(workspace).getByRole('combobox', { name: '图像服务' });

    expect(editor).toContainElement(referenceUpload);
    expect(editor).toHaveTextContent('JPG、PNG、WebP，最大 20 MB');
    expect(editor).toHaveTextContent('0/1');
    expect(model.compareDocumentPosition(referenceUpload) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(prompt).toHaveAttribute('rows', '7');
    expect(referenceUpload.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
  });

  it('expands and collapses the editor without changing or submitting the draft', () => {
    const fixture = createFixture();
    renderWorkspace(fixture, { ...fixture.currentJob(), state: { prompt: 'A bright studio', provider: 'openai' } });
    const prompt = screen.getByRole('textbox', { name: '提示词' });
    fireEvent.click(screen.getByRole('button', { name: '展开编辑区' }));
    expect(prompt).toHaveAttribute('rows', '14');
    expect(screen.getByRole('button', { name: '收起编辑区' })).toHaveAttribute('aria-expanded', 'true');
    expect(prompt).toHaveValue('A bright studio');
    fireEvent.click(screen.getByRole('button', { name: '收起编辑区' }));
    expect(prompt).toHaveAttribute('rows', '7');
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });

  it('validates required reference input while typing and blocks generation until uploaded', async () => {
    const fixture = createFixture();
    renderWorkspace(fixture);
    const prompt = screen.getByRole('textbox', { name: '提示词' });
    fireEvent.change(prompt, { target: { value: '以上传的人物照片为唯一主体，生成复古海报' } });
    expect(prompt).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('请先上传参考图');
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    expect(screen.getByRole('textbox', { name: '提示词' })).toBeInTheDocument();
    expect(fixture.uploadReferenceImage).not.toHaveBeenCalled();
    expect(fixture.applyAction).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('上传图像生成参考图'), { target: { files: [new File([png('reference')], 'reference.png', { type: 'image/png' })] } });
    });
    expect(prompt).toHaveAttribute('aria-invalid', 'false');
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(fixture.uploadReferenceImage).toHaveBeenCalledOnce());
  });

  it('blocks generation from a restored settings step with a missing reference', () => {
    const fixture = createFixture();
    renderWorkspace(fixture, { ...fixture.currentJob(), state: {
      ...fixture.currentJob().state, prompt: 'Edit the attached photo', currentStep: 2, furthestStep: 2
    } });
    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    expect(screen.getByRole('textbox', { name: '提示词' })).toBeInTheDocument();
    expect(fixture.applyAction).not.toHaveBeenCalled();
  });

  it('shows the actual stage failure instead of discarding it for a generic service error', () => {
    const fixture = createFixture();
    const job = fixture.currentJob();
    renderWorkspace(fixture, { ...job, status: 'failed', stages: [{
      id: 'stage-failed', jobId: job.id, stageId: 'generate', executor: 'image',
      status: 'failed', dispatchStatus: 'finished', claimOwner: null, claimExpiresAt: null,
      attempt: 1, idempotencyKey: null, scopeKey: null, inputFingerprint: null, progress: {},
      errorCode: 'image_generation_failed', errorMessage: 'Codex 无法获取所需的参考图，请先上传图片后重试。 token=private-secret',
      startedAt: job.createdAt, finishedAt: job.createdAt
    }] });
    expect(screen.getByRole('alert')).toHaveTextContent('Codex 无法获取所需的参考图，请先上传图片后重试');
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-secret');
  });

  it.each([
    ['empty.png', '', 'image/png'],
    ['file.txt', 'text', 'text/plain']
  ])('rejects an invalid reference before uploading (%s)', (name, content, type) => {
    const file = new File([content], name, { type });
    const fixture = createFixture();
    renderWorkspace(fixture);
    fireEvent.change(screen.getByLabelText('上传图像生成参考图'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('参考图必须是非空的 PNG、JPEG 或 WebP 图片，且不超过 20 MB。');
    expect(fixture.uploadReferenceImage).not.toHaveBeenCalled();
  });

  it('keeps preview URLs and image nodes across repeated job snapshots, but reloads changed results', async () => {
    const fixture = createFixture();
    const artifact = imageArtifact(fixture.currentJob().id, 1, fixture.currentJob().createdAt);
    const job: CreatorJob = { ...fixture.currentJob(), status: 'completed', artifacts: [artifact] };
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => 'blob:result-1').mockImplementationOnce(() => 'blob:result-2');
    const view = renderWorkspace(fixture, job);
    const image = await screen.findByRole('img', { name: '生成图片 1' });
    expect(image).toHaveAttribute('src', 'blob:result-1');
    for (let revision = 1; revision <= 3; revision += 1) {
      await view.pushSnapshot({ ...structuredClone(job), revision });
      expect(screen.getByRole('img', { name: '生成图片 1' })).toBe(image);
      expect(image).toHaveAttribute('src', 'blob:result-1');
    }
    expect(fixture.openArtifact).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await view.pushSnapshot({ ...job, revision: 4, artifacts: [artifact, imageArtifact(job.id, 2, job.createdAt)] });
    await waitFor(() => expect(screen.getByRole('img', { name: '生成图片 1' })).toHaveAttribute('src', 'blob:result-2'));
    expect(fixture.openArtifact).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result-1');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:result-2');
  });

  it('releases preview URLs when an in-flight fetch finishes after unmount', async () => {
    const fixture = createFixture();
    let finish!: (response: Response) => void;
    fixture.openArtifact.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const artifact = imageArtifact(fixture.currentJob().id, 1, fixture.currentJob().createdAt);
    const view = renderWorkspace(fixture, { ...fixture.currentJob(), artifacts: [artifact] });
    await waitFor(() => expect(fixture.openArtifact).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => { finish(new Response(new Blob([png('result')], { type: 'image/png' }))); });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:image-generation-reference');
  });

  it('does not persist an untouched pending project', async () => {
    vi.useFakeTimers();
    try {
      const fixture = createFixture({ pending: true });
      renderWorkspace(fixture);

      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(fixture.ensureJob).not.toHaveBeenCalled();
      expect(fixture.applyAction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('inherits Codex and its single-candidate limit from AI service settings', async () => {
    const fixture = createFixture({ pending: true });
    const config = createDefaultCreatorServicesConfig();
    config.image.provider = 'codex-native';
    renderWorkspace(fixture, fixture.currentJob(), {
      getConfig: vi.fn(async () => ({ config, configuredCredentials: [] }))
    });

    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), {
      target: { value: '使用默认 Codex 生成一张图片' }
    });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '图像服务' })).toHaveValue('codex-native'));
    expect(screen.getByRole('radio', { name: '1 张' })).toHaveAttribute('aria-checked', 'true');
    expect(fixture.ensureJob).not.toHaveBeenCalled();
  });

  it.each([
    ['gemini', 'Gemini'],
    ['jimeng', '即梦'],
    ['kling', '可灵']
  ] as const)('keeps the preset-selected %s provider', async (provider, label) => {
    vi.useFakeTimers();
    try {
      const fixture = createFixture();
      const initialJob: CreatorJob = {
        ...fixture.currentJob(),
        presetOrigin: {
          module: 'image-generation',
          id: `${provider}-preset`,
          version: 1,
          locale: 'zh-CN',
          title: `${label} 模板`,
          contentHash: 'a'.repeat(64)
        },
        state: {
          ...fixture.currentJob().state,
          provider,
          currentStep: 1,
          furthestStep: 1
        }
      };

      renderWorkspace(fixture, initialJob);
      expect(screen.getByRole('combobox', { name: '图像服务' })).toHaveValue(provider);
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(fixture.applyAction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens saved wizard drafts with prompt and settings together and the summary above the conversation', () => {
    const fixture = createFixture();
    const initialJob: CreatorJob = {
      ...fixture.currentJob(),
      state: {
        ...fixture.currentJob().state,
        prompt: '一张产品主视觉',
        currentStep: 1,
        furthestStep: 1
      }
    };

    renderWorkspace(fixture, initialJob);

    const workspace = screen.getByRole('region', { name: '图像生成 操作区' });
    expect(within(workspace).getByRole('textbox', { name: '提示词' })).toHaveValue('一张产品主视觉');
    expect(within(workspace).getByRole('combobox', { name: '图片画幅' })).toBeInTheDocument();
    expect(within(workspace).getByRole('button', { name: '开始生成' })).toBeInTheDocument();
    expect(within(workspace).queryByRole('navigation', { name: '图像生成流程' })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('button', { name: '继续' })).not.toBeInTheDocument();
    expect(within(workspace).queryByRole('complementary', { name: '任务摘要' })).not.toBeInTheDocument();
    const summary = screen.getByRole('complementary', { name: '任务摘要' });
    const panel = summary.closest('.creator-collaboration-panel')!;
    expect(panel.querySelector('.creator-collaboration-task-summary')).toContainElement(summary);
    expect(summary.compareDocumentPosition(panel.querySelector('.creator-collaboration-messages')!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(summary).toHaveTextContent('一张产品主视觉');
  });

  it('opens an existing project on its persisted result version', async () => {
    const fixture = createFixture();
    const createdAt = fixture.currentJob().createdAt;
    const versionOne = imageArtifact(fixture.currentJob().id, 1, createdAt);
    const versionTwo = imageArtifact(fixture.currentJob().id, 2, createdAt);
    const initialJob: CreatorJob = {
      ...fixture.currentJob(),
      status: 'completed',
      artifacts: [versionOne, versionTwo],
      state: {
        ...fixture.currentJob().state,
        currentStep: 1,
        furthestStep: 2,
        resultVersion: 1,
        latestResultVersion: 2,
        resultSnapshots: [
          imageResultSnapshot(1, versionOne, createdAt),
          imageResultSnapshot(2, versionTwo, createdAt)
        ]
      }
    };

    renderWorkspace(fixture, initialJob);

    expect(await screen.findByRole('heading', { name: '生成结果' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '项目 V1' })).toBeInTheDocument();
    await waitFor(() => expect(fixture.openArtifact).toHaveBeenCalledWith(
      initialJob.id,
      versionOne.id
    ));
  });

  it('uploads the selected reference before starting image generation', async () => {
    const fixture = createFixture();
    renderWorkspace(fixture);
    const workspace = screen.getByRole('region', { name: '图像生成 操作区' });
    const reference = new File([png('reference')], 'reference.png', {
      type: 'image/png',
      lastModified: 123
    });

    fireEvent.change(within(workspace).getByRole('textbox', { name: '提示词' }), {
      target: { value: '参考上传图片的主体和构图生成新画面' }
    });
    fireEvent.change(within(workspace).getByLabelText('上传图像生成参考图'), {
      target: { files: [reference] }
    });
    fireEvent.click(within(workspace).getByRole('button', { name: '开始生成' }));

    await waitFor(() => expect(fixture.uploadReferenceImage).toHaveBeenCalledWith(
      'creator_job_image_ui',
      expect.objectContaining({ file: reference })
    ));
    await waitFor(() => expect(fixture.applyAction).toHaveBeenCalledWith(
      'creator_job_image_ui',
      expect.objectContaining({
        action: 'run-stage',
        input: { stageId: 'generate' }
      })
    ));
    const uploadOrder = fixture.uploadReferenceImage.mock.invocationCallOrder[0]!;
    const runOrder = fixture.applyAction.mock.invocationCallOrder.at(-1)!;
    expect(uploadOrder).toBeLessThan(runOrder);
  });
});

function renderWorkspace(
  fixture: ReturnType<typeof createFixture>,
  initialJob = fixture.currentJob(),
  creatorServicesService?: { getConfig(): Promise<unknown> },
  gatewayState?: GatewayAccountState,
  language: 'zh-CN' | 'en-US' | 'sv-SE' = 'zh-CN'
) {
  let currentSession: CreatorSessionContextValue | null = null;
  const view = render(
    <LanguageProvider initialPreference={language}>
      <CreatorSessionProvider
        initialJob={initialJob}
        ensureJob={fixture.ensureJob}
        service={{
          applyAction: fixture.applyAction,
          uploadReferenceImage: fixture.uploadReferenceImage,
          openArtifact: fixture.openArtifact,
          runAgentTurn: vi.fn()
        } as never}
      >
        <OfficialServicesContext.Provider value={gatewayState}>
        <SessionObserver onSession={session => { currentSession = session; }} />
        <ImageGenerationWorkspace
          onBack={vi.fn()}
          creatorServicesService={creatorServicesService as never}
        />
        </OfficialServicesContext.Provider>
      </CreatorSessionProvider>
    </LanguageProvider>
  );
  return { ...view, async pushSnapshot(job: CreatorJob) {
    await act(async () => { currentSession!.applyRemoteSnapshot(job); });
  } };
}

function SessionObserver(props: { onSession(session: CreatorSessionContextValue | null): void }) {
  props.onSession(useOptionalCreatorSession());
  return null;
}

function imageArtifact(jobId: string, resultVersion: number, createdAt: string): CreatorArtifact {
  return {
    id: `generated_image_v${resultVersion}`,
    jobId,
    kind: 'generated_image',
    version: resultVersion,
    status: 'completed',
    path: `/tmp/generated-image-v${resultVersion}.png`,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {
      candidate: 1,
      resultVersion,
      fileName: `generated-image-v${resultVersion}.png`,
      mimeType: 'image/png'
    },
    createdAt
  };
}

function imageResultSnapshot(
  version: number,
  artifact: CreatorArtifact,
  createdAt: string
): CreatorJson {
  return {
    version,
    createdAt,
    action: 'stage-succeeded',
    stageId: 'generate',
    description: `生成图片 V${version}`,
    artifactRefs: { generated_image: [artifact.id] },
    changedArtifactIds: [artifact.id],
    staleArtifactIds: [],
    state: {
      prompt: `第 ${version} 版图片`,
      provider: 'openai',
      size: '1024x1024',
      quality: 'medium',
      candidateCount: 1
    }
  };
}

function createFixture(options: { pending?: boolean } = {}) {
  const createdAt = '2026-09-01T08:00:00.000Z';
  let job: CreatorJob = {
    id: options.pending ? 'pending:project_1:image-generation' : 'creator_job_image_ui',
    projectId: 'project_1',
    templateId: 'image-generation',
    templateVersion: options.pending ? 1 : 2,
    status: 'draft',
    revision: 0,
    presetOrigin: null,
    state: options.pending ? {} : {
      prompt: '',
      provider: 'openai',
      size: '1024x1024',
      quality: 'medium',
      candidateCount: 2,
      referenceImageArtifactId: null,
      currentStep: 0,
      furthestStep: 0,
      currentStage: null
    },
    agentThreadId: null,
    stages: [],
    artifacts: [],
    providerRequests: [],
    activities: [],
    createdAt,
    updatedAt: createdAt
  };

  const applyAction = vi.fn(async (_jobId: string, request: CreatorActionRequest) => {
    const patch = request.action === 'update-settings'
      ? request.input.patch as Record<string, CreatorJson>
      : {};
    job = {
      ...job,
      revision: job.revision + 1,
      state: { ...job.state, ...patch }
    };
    return {
      job,
      receipt: {
        actor: 'user' as const,
        action: request.action,
        summary: request.action,
        affectedArtifacts: [],
        newRevision: job.revision,
        createdAt
      }
    };
  });

  const ensureJob = vi.fn(async (state: Record<string, CreatorJson>) => {
    job = {
      ...job,
      id: 'creator_job_image_ui',
      templateVersion: 2,
      state
    };
    return job;
  });

  const uploadReferenceImage = vi.fn(async (_jobId: string, input: {
    file: File;
    expectedRevision: number;
  }) => {
    const artifact: CreatorArtifact = {
      id: 'reference_artifact_image_1',
      jobId: job.id,
      kind: 'reference_image',
      version: 1,
      status: 'completed',
      path: '/tmp/reference.png',
      scopeKey: null,
      inputFingerprint: null,
      sha256: null,
      sourceArtifactIds: [],
      metadata: {
        fileName: input.file.name,
        size: input.file.size,
        lastModified: input.file.lastModified,
        mimeType: input.file.type
      },
      createdAt
    };
    job = {
      ...job,
      revision: job.revision + 1,
      artifacts: [...job.artifacts, artifact],
      state: { ...job.state, referenceImageArtifactId: artifact.id }
    };
    return { job, artifact, deduplicated: false };
  });

  return {
    currentJob: () => job,
    ensureJob,
    applyAction,
    uploadReferenceImage,
    openArtifact: vi.fn(async () => (
      new Response(new Blob([png('reference')], { type: 'image/png' }))
    ))
  };
}

function png(label: string): ArrayBuffer {
  return Uint8Array.from(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(label.padEnd(24, '.'))
  ])).buffer;
}
