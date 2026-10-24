import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreatorJob, CreatorJson, GatewayAccountState } from '@opencreator/protocol';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import AutoClipWorkspace from './AutoClipWorkspace.js';
import CoverGeneratorWorkspace from './CoverGeneratorWorkspace.js';
import ShortVideoScriptWorkspace from './ShortVideoScriptWorkspace.js';
import StickmanVideoWorkspace from './StickmanVideoWorkspace.js';
import WechatArticleWorkspace from './WechatArticleWorkspace.js';
import XiaohongshuPostWorkspace from './XiaohongshuPostWorkspace.js';
import { CreatorSessionProvider, useCreatorSession } from './creator-session-store.js';
import { OfficialServicesContext, OfficialTaskModelFields } from './official-services.js';

const modalities = ['text', 'image', 'video', 'speech', 'transcription'] as const;
const labels = { text: '文本模型', image: '图片模型', video: '视频模型', speech: '语音合成模型', transcription: '语音识别模型' };
function account(): GatewayAccountState {
  return { source: 'gateway', transport: 'gateway', authState: 'signed_in', activationState: 'ready',
    account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: '1', activationError: null,
    selectedModels: Object.fromEntries(modalities.map(modality => [modality, `${modality}-default`])),
    models: modalities.flatMap(modality => ['default', 'alternate', 'new-default'].map(suffix => ({
      id: `${modality}-${suffix}`, name: `${modality} ${suffix}`, modality, catalogSchema: 2,
      capabilities: modality === 'text' ? ['responses', 'chat'] : modality === 'transcription' ? ['subtitle_timestamps'] : ['generate', 'edit'],
      ...(modality === 'speech' ? { voices: ['alloy'] } : {})
    }))) };
}
function job(templateId = 'image-generation'): CreatorJob {
  return { id: 'model-task', projectId: 'project', templateId, templateVersion: 2, status: 'draft', revision: 0,
    presetOrigin: null, agentThreadId: null, stages: [], artifacts: [], activities: [], providerRequests: [],
    state: { currentStep: 1, sourceType: 'url', sourceUrl: 'https://youtu.be/model-test', sourceText: 'A story', prompt: 'A cover', topic: 'A topic' },
    createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z' };
}
function fixture(initial: CreatorJob, gateway = account()) {
  let current = initial;
  let session!: ReturnType<typeof useCreatorSession>;
  const applyAction = vi.fn(async (_id: string, request: { action: string; input: { patch?: Record<string, CreatorJson> } }) => {
    current = { ...current, revision: current.revision + 1, state: { ...current.state, ...request.input.patch } };
    return { job: current };
  });
  function Observe() { session = useCreatorSession(); return null; }
  function Wrapper(props: { children: ReactNode }) {
    return <LanguageProvider initialPreference="zh-CN"><OfficialServicesContext.Provider value={gateway}>
      <CreatorSessionProvider initialJob={initial} service={{ applyAction, runAgentTurn: vi.fn() } as never}><Observe />{props.children}</CreatorSessionProvider>
    </OfficialServicesContext.Provider></LanguageProvider>;
  }
  return { Wrapper, gateway, applyAction, getSession: () => session, current: () => current };
}

describe('task model selection audit', () => {
  it.each([
    { template: 'cover', Component: CoverGeneratorWorkspace, fields: ['text', 'image'] },
    { template: 'short-video-script', Component: ShortVideoScriptWorkspace, fields: ['text'] },
    { template: 'xiaohongshu-post', Component: XiaohongshuPostWorkspace, fields: ['text'] },
    { template: 'wechat-article', Component: WechatArticleWorkspace, fields: ['text', 'image'] },
    { template: 'auto-clip', Component: AutoClipWorkspace, fields: ['text', 'transcription'] },
    { template: 'stickman-video', Component: StickmanVideoWorkspace, fields: ['text', 'image', 'speech', 'transcription'] }
  ] as const)('$template exposes and saves each model used by the task without starting inference', async ({ template, Component, fields }) => {
    const f = fixture(job(template));
    render(<Component onBack={vi.fn()} />, { wrapper: f.Wrapper });
    if (template === 'auto-clip') fireEvent.click(screen.getByRole('button', { name: '下一步：切片设置' }));
    for (const modality of fields) {
      const field = screen.getByRole('combobox', { name: labels[modality] });
      expect(field).toHaveValue(`${modality} default`);
      fireEvent.click(field);
      fireEvent.click(screen.getByRole('option', { name: `${modality} alternate` }));
      expect(field).toHaveValue(`${modality} alternate`);
    }
    await act(async () => { await f.getSession().flush(); });
    for (const modality of fields) expect((f.current().state.officialModels as Record<string, string>)[modality]).toBe(`${modality}-alternate`);
    expect(f.gateway.selectedModels).toEqual(Object.fromEntries(modalities.map(modality => [modality, `${modality}-default`])));
    expect(f.applyAction.mock.calls.every(([, request]) => request.action === 'update-settings')).toBe(true);
  });

  it('initializes five fields together, preserves task overrides when defaults change, and locks choices during execution', async () => {
    const initial = job();
    const f = fixture(initial);
    function Fields() { return <OfficialTaskModelFields modalities={[...modalities]} />; }
    const view = render(<Fields />, { wrapper: f.Wrapper });
    await waitFor(() => expect(f.getSession().state.officialModels).toEqual(f.gateway.selectedModels));
    for (const modality of modalities) {
      fireEvent.click(screen.getByRole('combobox', { name: labels[modality] }));
      fireEvent.click(screen.getByRole('option', { name: `${modality} alternate` }));
    }
    await act(async () => { await f.getSession().flush(); });
    f.gateway.selectedModels = Object.fromEntries(modalities.map(modality => [modality, `${modality}-new-default`]));
    view.rerender(<Fields />);
    for (const modality of modalities) expect(screen.getByRole('combobox', { name: labels[modality] })).toHaveValue(`${modality} alternate`);
    const saved = f.current();
    view.unmount();
    const reloaded = fixture(saved, f.gateway);
    render(<Fields />, { wrapper: reloaded.Wrapper });
    for (const modality of modalities) expect(screen.getByRole('combobox', { name: labels[modality] })).toHaveValue(`${modality} alternate`);
    await act(async () => { reloaded.getSession().applyRemoteSnapshot({ ...saved, revision: saved.revision + 1, status: 'running' }); });
    for (const modality of modalities) expect(screen.getByRole('combobox', { name: labels[modality] })).toBeDisabled();
  });
});
