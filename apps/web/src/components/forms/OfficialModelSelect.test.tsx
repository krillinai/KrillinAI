import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import OfficialModelSelect from './OfficialModelSelect.js';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';

function catalog() {
  const models = Array.from({ length: 12 }, (_, index) => ({ id: `vendor/model-${index}`, name: `Model ${index}`, modality: 'text' as const, capabilities: ['responses'] }));
  models.push({ id: 'openrouter/auto', name: 'OpenRouter Automatic', modality: 'text', capabilities: ['responses'] });
  return models;
}

it('shows locally hosted brand marks and only model-supported video details', async () => {
  const models = [
    { id: 'bytedance/seedance-2', name: 'Seedance 2.0', modality: 'video' as const, capabilities: [], durations: [5, 10] },
    { id: 'google/veo-3.1', name: 'Veo 3.1', modality: 'video' as const, capabilities: [], durations: [4, 8], resolutions: ['720p'] },
    { id: 'custom/private-video', name: 'Private Video', modality: 'video' as const, capabilities: [] }
  ];
  render(<OfficialModelSelect label="视频模型" models={models} value={models[0]!.id} onChange={vi.fn()} />);
  const input = screen.getByRole('combobox');
  expect(input.parentElement?.querySelector('[data-brand="bytedance"] img')).toHaveAttribute('src', '/model-brands/bytedance-color.svg');
  await userEvent.setup().click(input);
  const veo = screen.getByRole('option', { name: 'Veo 3.1' });
  expect(veo.querySelector('[data-brand="google"] img')).toHaveAttribute('src', '/model-brands/google-color.svg');
  expect(veo).toHaveTextContent('Google · 4 / 8 秒 · 720p');
  const unknown = screen.getByRole('option', { name: 'Private Video' });
  expect(unknown.querySelector('[data-brand="generic"] svg')).not.toBeNull();
  expect(unknown).not.toHaveTextContent(/秒|720p/);
  expect(within(unknown).queryByRole('img')).not.toBeInTheDocument();
});

it('keeps options usable if a brand image fails to load', async () => {
  const change = vi.fn();
  render(<OfficialModelSelect label="模型" models={[{ id: 'kling-v2-1-master', name: 'Kling 2.1 Master', modality: 'video', capabilities: [] }]} value="" onChange={change} />);
  await userEvent.setup().click(screen.getByRole('combobox'));
  const option = screen.getByRole('option', { name: 'Kling 2.1 Master' });
  fireEvent.error(option.querySelector('img')!);
  expect(option.querySelector('img')).toBeNull();
  expect(option.querySelector('svg')).not.toBeNull();
  await userEvent.setup().click(option);
  expect(change).toHaveBeenCalledExactlyOnceWith('kling-v2-1-master');
});

it('localizes branded video metadata and search states in Swedish', async () => {
  render(<LanguageProvider initialPreference="sv-SE"><OfficialModelSelect label="Videomodell" models={[{
    id: 'google/veo-3.1', name: 'Veo 3.1', modality: 'video', capabilities: [], durations: [4, 8]
  }]} value="google/veo-3.1" onChange={vi.fn()} /></LanguageProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Videomodell' }));
  expect(screen.getByRole('option', { name: 'Veo 3.1' })).toHaveTextContent('Google · 4 / 8 sekunder');
  expect(screen.getByText('1 modeller')).toBeInTheDocument();
  await user.type(screen.getByRole('combobox'), 'zzzzzzzzzz');
  expect(screen.getByText('Inga matchande modeller')).toBeInTheDocument();
});

it('shows search results immediately in the same control without retaining unrelated selected models', async () => {
  const models = catalog(); const change = vi.fn();
  const view = render(<OfficialModelSelect label="文本模型" models={models} value="vendor/model-0" onChange={change} />);
  const user = userEvent.setup(); const input = screen.getByRole('combobox', { name: '文本模型' });
  expect(input).toHaveValue('Model 0');
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await user.click(input);
  expect(screen.getByRole('option', { name: 'Model 0' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText(/OpenRouter/i)).not.toBeInTheDocument();
  await user.type(input, 'Model 11');
  const list = screen.getByRole('listbox', { name: '文本模型' });
  expect(within(list).getAllByRole('option')).toHaveLength(1);
  expect(screen.getByText('1 个匹配项')).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
  await user.click(within(list).getByRole('option', { name: 'Model 11' }));
  expect(change).toHaveBeenCalledWith('vendor/model-11');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  view.rerender(<OfficialModelSelect label="文本模型" models={models} value="vendor/model-11" onChange={change} />);
  expect(input).toHaveValue('Model 11');
});

it('matches names, provider IDs, punctuation and multiple keywords, with typo tolerance', async () => {
  const models = [
    { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini', modality: 'text' as const, capabilities: ['responses'] },
    { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', modality: 'text' as const, capabilities: ['responses'] },
    ...catalog(),
  ];
  render(<OfficialModelSelect label="文本模型" models={models} value="vendor/model-0" onChange={vi.fn()} />);
  const user = userEvent.setup(); const input = screen.getByRole('combobox');
  await user.click(input);
  for (const query of ['MINI gPt 4.o', 'openai/gpt_4o_mini']) {
    await user.clear(input); await user.type(input, query);
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'OpenAI: GPT-4o Mini' })).toBeInTheDocument();
  }
  await user.clear(input); await user.type(input, 'depseek');
  expect(screen.getAllByRole('option')[0]).toHaveAccessibleName('DeepSeek V3.2');
});

it('preserves the selection when no model matches or the user cancels and resets search on reopening', async () => {
  const change = vi.fn();
  render(<><OfficialModelSelect label="文本模型" models={catalog()} value="vendor/model-0" onChange={change} /><button>外部操作</button></>);
  const user = userEvent.setup(); const input = screen.getByRole('combobox');
  await user.click(input); await user.type(input, 'zzzzzzzzzzzz');
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(screen.getByText('未找到匹配模型')).toBeInTheDocument();
  await user.keyboard('{Enter}'); expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '外部操作' }));
  expect(input).toHaveValue('Model 0');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await user.click(input);
  expect(screen.getAllByRole('option')).toHaveLength(13);
  expect(input).toHaveValue('');
  await user.type(input, 'Model 11'); await user.keyboard('{Escape}');
  expect(input).toHaveValue('Model 0'); expect(change).not.toHaveBeenCalled();
});

it('supports keyboard navigation, selection and tab dismissal without moving focus into the menu', async () => {
  const change = vi.fn();
  render(<><OfficialModelSelect label="文本模型" models={catalog()} value="vendor/model-0" onChange={change} /><button>下一个控件</button></>);
  const user = userEvent.setup(); const input = screen.getByRole('combobox');
  await user.tab();
  expect(input).toHaveFocus(); expect(input).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{ArrowDown}');
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Model 1' }).id);
  await user.keyboard('{Enter}'); expect(change).toHaveBeenCalledWith('vendor/model-1');
  expect(input).toHaveFocus(); expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  await user.tab();
  expect(screen.getByRole('button', { name: '下一个控件' })).toHaveFocus();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('clears a query without changing the selection and does not resubmit the selected model', async () => {
  const change = vi.fn(); render(<OfficialModelSelect label="文本模型" models={catalog()} value="vendor/model-0" onChange={change} />);
  const user = userEvent.setup(); const input = screen.getByRole('combobox');
  await user.click(input); await user.type(input, 'Model 11');
  await user.click(screen.getByRole('button', { name: '清空模型搜索' }));
  expect(input).toHaveFocus(); expect(input).toHaveValue('');
  expect(screen.getAllByRole('option')).toHaveLength(13);
  await user.click(screen.getByRole('option', { name: 'Model 0' }));
  expect(change).not.toHaveBeenCalled(); expect(input).toHaveValue('Model 0');
});

it('does not select a model when Enter confirms an IME composition', async () => {
  const change = vi.fn(); render(<OfficialModelSelect label="文本模型" models={catalog()} value="vendor/model-0" onChange={change} />);
  const input = screen.getByRole('combobox');
  await userEvent.setup().click(input); fireEvent.change(input, { target: { value: 'Model 11' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(change).not.toHaveBeenCalled(); expect(screen.getByRole('listbox')).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' }); expect(change).toHaveBeenCalledWith('vendor/model-11');
});

it('closes when disabled and retains accessibility descriptions and the selected model', async () => {
  const change = vi.fn(); const models = catalog();
  const view = render(<OfficialModelSelect label="文本模型" describedBy="model-count" models={models} value="vendor/model-0" onChange={change} />);
  const input = screen.getByRole('combobox'); await userEvent.setup().click(input);
  view.rerender(<OfficialModelSelect label="文本模型" describedBy="model-count" models={models} value="vendor/model-0" disabled onChange={change} />);
  expect(input).toBeDisabled(); expect(input).toHaveValue('Model 0');
  expect(input).toHaveAttribute('aria-describedby', 'model-count');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); expect(change).not.toHaveBeenCalled();
});
