import { act, fireEvent, render, screen } from '@testing-library/react';
import { creatorPromptMaxLength, type CreatorPresetSummary } from '@opencreator/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useAppLanguage } from '../../i18n/LanguageProvider.js';
import CoverGeneratorWorkspace from '../dashboard/CoverGeneratorWorkspace.js';
import ImageGenerationWorkspace from '../dashboard/ImageGenerationWorkspace.js';
import VideoGenerationWorkspace from '../dashboard/VideoGenerationWorkspace.js';
import { CreatorDashboard } from './CreatorDashboard.js';

const basePreset: CreatorPresetSummary = {
  module: 'image-generation', id: 'localized-poster', version: 1,
  title: '海报模板', description: '海报', coverUrl: '/cover.webp',
  prompt: '生成主题为 {topic} 的海报。', tags: [], featured: true, sortOrder: 1,
  requirements: null, highlights: []
};
const englishPreset: CreatorPresetSummary = {
  ...basePreset, title: 'Poster Template', description: 'Poster',
  prompt: 'Create a poster about {topic}. Keep the title "中国武汉".'
};

function LocalizedCatalog(props: { onSelect: (preset: CreatorPresetSummary) => void }) {
  const { language } = useAppLanguage();
  return <CreatorDashboard
    presets={[language === 'en-US' ? englishPreset : basePreset]}
    onSelectPreset={props.onSelect}
  />;
}

describe('Creator prompt language selection', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('follows the system language while keeping the open template and its output text', async () => {
    const systemLanguages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
    const onSelect = vi.fn();
    render(<LanguageProvider initialPreference="system">
      <LocalizedCatalog onSelect={onSelect} />
    </LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: '查看海报模板模板详情' }));
    expect(document.querySelector('.creator-template-prompt-card')).toHaveTextContent(basePreset.prompt!);

    systemLanguages.mockReturnValue(['en-US']);
    act(() => window.dispatchEvent(new Event('languagechange')));
    expect(screen.getByRole('heading', { name: 'Poster Template' })).toBeInTheDocument();
    expect(document.querySelector('.creator-template-prompt-card')).toHaveTextContent(englishPreset.prompt!);
    expect(document.querySelector('.creator-template-prompt-variable'))
      .toHaveAttribute('title', 'Replaceable variable');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use this template' })));
    expect(onSelect).toHaveBeenCalledWith(englishPreset);

    systemLanguages.mockReturnValue(['zh-CN']);
    act(() => window.dispatchEvent(new Event('languagechange')));
    expect(document.querySelector('.creator-template-prompt-card')).toHaveTextContent(basePreset.prompt!);
    expect(document.querySelector('.creator-template-prompt-card')).not.toHaveTextContent('Create a poster');
  });

  it.each([
    ['image', ImageGenerationWorkspace, 'Prompt'],
    ['video', VideoGenerationWorkspace, 'Prompt'],
    ['cover', CoverGeneratorWorkspace, 'Content and requirements']
  ] as const)('allows a long original in the %s prompt input', (_module, Workspace, label) => {
    render(<LanguageProvider initialPreference="en-US"><Workspace onBack={() => undefined} /></LanguageProvider>);
    const prompt = screen.getByRole('textbox', { name: label });
    expect(prompt).toHaveAttribute('maxlength', String(creatorPromptMaxLength));
    const original = 'Original English source prompt. '.repeat(200);
    fireEvent.change(prompt, { target: { value: original } });
    expect(prompt).toHaveValue(original);
  });
});
