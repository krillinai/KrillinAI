import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { gatewayRecommendedModelId, type GatewayAccountState } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { createGatewayAccountService } from '../../services/gateway-account-service.js';
import { OfficialServicesSettingsView } from './OfficialServicesSettingsView.js';

function fixture() {
  const state: GatewayAccountState = { source: 'gateway', transport: 'gateway', authState: 'signed_in', activationState: 'ready',
    account: { id: 'a', email: 'a@test', verified: true }, bindingVersion: '1', activationError: null,
    selectedModels: { text: 'gpt-6.1-sol', image: 'gpt-image-2', transcription: 'whisper-1' },
    recommendedModels: { text: 'gpt-6.1-sol' }, modelSelectionModes: { text: 'recommended' }, models: [
      { id: 'gpt-6.1-sol', modality: 'text', capabilities: ['responses', 'chat'], recommended: true, price: { version: 'v1', inputPerMillion: 2, outputPerMillion: 10 } },
      { id: 'gpt-5.4', modality: 'text', capabilities: ['responses', 'chat'] },
      { id: 'claude-future', vendor: 'Anthropic', modality: 'text', capabilities: ['responses', 'chat'] },
      { id: 'chat-only', modality: 'text', capabilities: ['chat'] },
      { id: 'gpt-image-2', modality: 'image', capabilities: [] },
      { id: 'plain-asr', modality: 'transcription', capabilities: ['transcribe'] },
      { id: 'whisper-1', modality: 'transcription', capabilities: ['transcribe', 'subtitle_timestamps'] },
    ] };
  const client = { get: vi.fn().mockResolvedValue(state), post: vi.fn(), patch: vi.fn().mockResolvedValue(state) };
  const service = createGatewayAccountService(client);
  const changed = vi.fn();
  const renderState = (next: GatewayAccountState) => <LanguageProvider initialPreference="zh-CN"><OfficialServicesSettingsView state={next} service={service} onChange={changed} /></LanguageProvider>;
  const view = render(renderState(state));
  return { state, client, changed, view, renderState, user: userEvent.setup() };
}

it('shows five modalities with unified text and transcription and no paid test controls', () => {
  const f = fixture();
  expect(screen.getAllByRole('combobox')).toHaveLength(5);
  for (const name of ['文本模型', '图片模型', '视频模型', '语音合成模型', '转录模型']) expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: '文本模型' })).toHaveValue('系统推荐 · gpt-6.1-sol');
  expect(screen.getByRole('combobox', { name: '视频模型' })).toBeDisabled();
  expect(screen.queryByText('文本处理模型')).not.toBeInTheDocument();
  expect(screen.queryByText('字幕转录模型')).not.toBeInTheDocument();
  expect(screen.queryByText('未验证')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /测试/ })).not.toBeInTheDocument();
  expect(f.client.post).not.toHaveBeenCalled();
});

it('filters unsupported candidates and saves a manual model without inference', async () => {
  const f = fixture();
  await f.user.click(screen.getByRole('combobox', { name: '文本模型' }));
  expect(screen.queryByRole('option', { name: 'claude-future' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'chat-only' })).not.toBeInTheDocument();
  await f.user.click(screen.getByRole('option', { name: 'gpt-5.4' }));
  await waitFor(() => expect(f.changed).toHaveBeenCalled());
  expect(f.client.patch).toHaveBeenCalledWith('/gateway/model', { modality: 'text', model: 'gpt-5.4' });
  expect(f.client.post).not.toHaveBeenCalled();
  await f.user.click(screen.getByRole('combobox', { name: '转录模型' }));
  expect(screen.queryByRole('option', { name: 'plain-asr' })).not.toBeInTheDocument();
});

it('lets a manual user return to recommendations and reflects a new recommended version', async () => {
  const f = fixture();
  f.view.rerender(f.renderState({ ...f.state, selectedModels: { text: 'gpt-5.4' }, modelSelectionModes: { text: 'manual' } }));
  await f.user.click(screen.getByRole('combobox', { name: '文本模型' }));
  await f.user.click(screen.getByRole('option', { name: '系统推荐 · gpt-6.1-sol' }));
  await waitFor(() => expect(f.client.patch).toHaveBeenCalledWith('/gateway/model', { modality: 'text', model: gatewayRecommendedModelId }));
  f.view.rerender(f.renderState({ ...f.state, selectedModels: { text: 'gpt-6.2-sol' }, recommendedModels: { text: 'gpt-6.2-sol' },
    models: [...f.state.models, { id: 'gpt-6.2-sol', modality: 'text', capabilities: ['responses', 'chat'] }] }));
  expect(screen.getByRole('combobox', { name: '文本模型' })).toHaveValue('系统推荐 · gpt-6.2-sol');
});

it('refreshes the catalog without inference', async () => {
  const f = fixture();
  await f.user.click(screen.getByRole('button', { name: '刷新模型列表' }));
  await waitFor(() => expect(f.changed).toHaveBeenCalledWith(f.state));
  expect(f.client.get).toHaveBeenCalledWith('/gateway/account?refreshModels=1');
  expect(f.client.post).not.toHaveBeenCalled();
});
