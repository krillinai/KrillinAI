import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultSubtitleStyleAsset,
  type DictionaryAsset,
  type PersonalAsset
} from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { createAssetFixture } from '../../test/personal-assets-fixture.js';
import { AssetLibraryProvider } from './asset-library-context.js';
import AssetLibraryPage from './AssetLibraryPage.js';
import { DictionaryAssetPicker } from './DictionaryAssetPicker.js';
import { TtsVoicePicker } from '../../components/tts/TtsVoicePicker.js';

const dictionary: DictionaryAsset = {
  id: 'dictionary-1',
  kind: 'dictionary',
  name: 'Product terms',
  revision: 1,
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
  data: {
    entries: [
      {
        source: 'OpenCreator',
        targetLanguage: 'zh_cn',
        translation: '开放创作',
        preserveOriginal: false,
        note: ''
      }
    ]
  }
};
function dialogs() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    }
  });
}
describe('personal asset library', () => {
  it('selects multiple glossaries and removes chips while the picker is closed', async () => {
    const second = { ...structuredClone(dictionary), id: 'dictionary-2', name: 'Brand terms' };
    const fixture = createAssetFixture([dictionary, second]);
    function Picker() {
      const [value, setValue] = useState<DictionaryAsset[]>([]);
      return <DictionaryAssetPicker value={value} targetLanguage="zh_cn" onChange={setValue} />;
    }
    await act(async () => {
      render(<LanguageProvider initialPreference="en-US"><AssetLibraryProvider service={fixture.service}><Picker /></AssetLibraryProvider></LanguageProvider>);
    });
    expect(screen.getByText('No glossary selected')).toBeVisible();
    const summary = screen.getByRole('button', { name: 'Add Translation Glossary' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Manage in Assets' })).toHaveAttribute('href', '#/assets');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Product terms' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Brand terms' }));
    expect(screen.getByText('· 2')).toBeVisible();
    fireEvent.click(summary);
    expect(screen.queryByRole('dialog', { name: 'Translation Glossary' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Product terms' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Product terms' }));
    expect(screen.getByText('· 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Brand terms' }));
    expect(screen.getByText('No glossary selected')).toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByRole('checkbox', { name: 'Product terms' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Brand terms' })).not.toBeChecked();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Translation Glossary' }), { key: 'Escape' });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveFocus();
    fireEvent.click(summary);
    fireEvent.pointerDown(document.body);
    expect(summary).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the version snapshot until a newer glossary revision is explicitly applied', async () => {
    const updated = { ...structuredClone(dictionary), revision: 2, name: 'Updated terms' };
    updated.data.entries[0]!.translation = 'New translation';
    const fixture = createAssetFixture([updated]);
    let selected: DictionaryAsset[] = [];
    function Picker() {
      const [value, setValue] = useState<DictionaryAsset[]>([structuredClone(dictionary)]);
      selected = value;
      return <DictionaryAssetPicker value={value} targetLanguage="zh_cn" onChange={setValue} />;
    }
    await act(async () => {
      render(<LanguageProvider initialPreference="en-US"><AssetLibraryProvider service={fixture.service}><Picker /></AssetLibraryProvider></LanguageProvider>);
    });
    expect(selected[0]).toEqual(dictionary);
    expect(screen.getByRole('button', { name: 'Remove Product terms' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(selected[0]).toEqual(updated);
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Updated terms' })).toBeVisible();
    updated.data.entries[0]!.translation = 'Library edited again';
    expect(selected[0]!.data.entries[0]!.translation).toBe('New translation');
  });

  it('searches term content and duplicates or deletes assets without mutating an existing task snapshot', async () => {
    const fixture = createAssetFixture([dictionary]);
    const snapshot = structuredClone(dictionary);
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <AssetLibraryPage voiceService={null} />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search assets' }), {
      target: { value: '开放创作' }
    });
    expect(screen.getByRole('button', { name: /Product terms/ })).toBeVisible();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(fixture.assets()).toHaveLength(2);
    expect(fixture.assets()[1]?.id).not.toBe(dictionary.id);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Delete'
        })
      );
    });
    expect(fixture.assets()).toHaveLength(1);
    expect(dictionary).toEqual(snapshot);
  });
  it('creates a dictionary in context, selects it immediately and keeps frozen content after library edits', async () => {
    dialogs();
    const fixture = createAssetFixture();
    let selected: DictionaryAsset[] = [];
    function Picker() {
      const [value, setValue] = useState<DictionaryAsset[]>([]);
      selected = value;
      return (
        <DictionaryAssetPicker
          value={value}
          targetLanguage="zh_cn"
          onChange={setValue}
        />
      );
    }
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <Picker />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Translation Glossary' }));
    fireEvent.click(screen.getByRole('button', { name: 'New glossary' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'New product' }
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Add term' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Source term' }), {
      target: { value: 'Keep' }
    });
    fireEvent.click(
      dialog.getByRole('checkbox', { name: 'Preserve original' })
    );
    await act(async () => {
      fireEvent.submit(
        dialog.getByRole('button', { name: 'Save' }).closest('form')!
      );
    });
    expect(selected[0]).toMatchObject({
      name: 'New product',
      data: { entries: [{ source: 'Keep', preserveOriginal: true }] }
    });
    fixture.assets()[0]!.name = 'Changed outside task';
    expect(selected[0]?.name).toBe('New product');
  });
  it('keeps the editor open and the draft intact when asset saving fails', async () => {
    dialogs();
    const fixture = createAssetFixture();
    fixture.service.create = vi.fn().mockRejectedValue(new Error('offline'));
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <AssetLibraryPage voiceService={null} />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'New glossary' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Keep this draft' }
    });
    await act(async () => {
      fireEvent.submit(
        dialog.getByRole('button', { name: 'Save' }).closest('form')!
      );
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Keep this draft'
    );
    expect(dialog.getByRole('alert')).toBeVisible();
  });
  it('merges compatible saved voices into the shared picker and excludes another model', async () => {
    const voice = (id: string, model: string): PersonalAsset => ({
      id,
      kind: 'voice',
      name: id,
      revision: 1,
      createdAt: dictionary.createdAt,
      updatedAt: dictionary.updatedAt,
      data: {
        provider: 'volcengine',
        model,
        voiceId: `S_${id}`,
        language: 'en'
      }
    });
    const fixture = createAssetFixture([
      voice('Compatible', 'seed-icl-2.0'),
      voice('Other model', 'seed-tts-2.0')
    ]);
    const service = {
      getTtsVoices: vi.fn(async () => ({
        provider: 'volcengine',
        model: 'seed-icl-2.0',
        voices: []
      })),
      previewTtsVoice: vi.fn()
    };
    const onChange = vi.fn();
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <TtsVoicePicker
              id="test-voices"
              provider="volcengine"
              model="seed-icl-2.0"
              value=""
              service={service as never}
              onChange={onChange}
            />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /Compatible/ })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: /Other model/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Compatible/ }));
    expect(onChange).toHaveBeenCalledWith(
      'S_Compatible',
      expect.objectContaining({ name: 'Compatible' })
    );
  });
  it('migrates browser subtitle templates before clearing the legacy key', async () => {
    const fixture = createAssetFixture();
    localStorage.setItem(
      'opencreator.videoTranslation.savedSubtitleStyles',
      JSON.stringify([
        { id: 'legacy', name: 'Legacy', style: defaultSubtitleStyleAsset }
      ])
    );
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <AssetLibraryPage voiceService={null} />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    expect(fixture.service.migrateStyles).toHaveBeenCalledOnce();
    expect(
      localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles')
    ).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Subtitle styles/ }));
    expect(screen.getByRole('button', { name: /Legacy/ })).toBeVisible();
  });
  it('retains legacy templates and still loads existing assets if migration fails', async () => {
    const fixture = createAssetFixture([dictionary]);
    fixture.service.migrateStyles = vi.fn().mockRejectedValue(new Error('offline'));
    const legacy = JSON.stringify([
      { id: 'legacy', name: 'Legacy', style: defaultSubtitleStyleAsset }
    ]);
    localStorage.setItem('opencreator.videoTranslation.savedSubtitleStyles', legacy);
    await act(async () => {
      render(
        <LanguageProvider initialPreference="en-US">
          <AssetLibraryProvider service={fixture.service}>
            <AssetLibraryPage voiceService={null} />
          </AssetLibraryProvider>
        </LanguageProvider>
      );
    });
    expect(screen.getByRole('button', { name: /Product terms/ })).toBeVisible();
    expect(localStorage.getItem('opencreator.videoTranslation.savedSubtitleStyles')).toBe(legacy);
    localStorage.removeItem('opencreator.videoTranslation.savedSubtitleStyles');
  });
});
