import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import {
  creatorTtsProviders,
  defaultSubtitleStyleAsset,
  type PersonalAsset,
  type PersonalAssetInput,
  type PersonalAssetKind,
  type CreatorTtsProvider,
  type SubtitleStyleAssetData
} from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { useAssetLibrary } from './asset-library-context.js';
import './assets.css';

export const dictionaryLanguages = [
  '*',
  'en',
  'zh_cn',
  'zh_tw',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'ar',
  'hi',
  'id',
  'th',
  'vi',
  'tr',
  'nl',
  'pl',
  'sv',
  'uk',
  'he',
  'fa',
  'ms',
  'bn',
  'ta',
  'te',
  'el',
  'ro',
  'hu',
  'cs',
  'da',
  'fi',
  'nb'
];
export function StyleAssetPreview({
  style
}: {
  style: SubtitleStyleAssetData;
}) {
  const l = useLocalizedCopy();
  return (
    <div className="asset-style-preview">
      <span
        style={
          {
            color: style.subtitleColor,
            fontFamily:
              style.subtitleFont === 'serif'
                ? 'serif'
                : style.subtitleFont === 'rounded'
                  ? 'ui-rounded, system-ui'
                  : 'system-ui',
            fontWeight:
              style.subtitleWeight === 'bold'
                ? 700
                : style.subtitleWeight === 'medium'
                  ? 500
                  : 400,
            fontSize:
              style.subtitleSize === 'large'
                ? 28
                : style.subtitleSize === 'small'
                  ? 18
                  : 23,
            WebkitTextStroke: `${style.subtitleOutlineWidth / 2}px ${style.subtitleOutlineColor}`,
            paintOrder: 'stroke fill',
            textShadow: style.subtitleShadowEnabled
              ? `${style.subtitleShadowOffsetX}px ${style.subtitleShadowOffsetY}px ${style.subtitleShadowBlur}px ${style.subtitleShadowColor}${Math.round(
                  style.subtitleShadowOpacity * 255
                )
                  .toString(16)
                  .padStart(2, '0')}`
              : undefined
          } as CSSProperties
        }
      >
        {l('让每一句都清晰动人', 'Make every word count')}
      </span>
      <span style={{ color: style.subtitleSecondaryColor }}>
        {l('字幕样式预览', 'Subtitle style preview')}
      </span>
    </div>
  );
}
export function newAsset(kind: PersonalAssetKind): PersonalAssetInput {
  if (kind === 'dictionary') return { kind, name: '', data: { entries: [] } };
  if (kind === 'voice')
    return {
      kind,
      name: '',
      data: { provider: 'volcengine', model: '', voiceId: '', language: '' }
    };
  return { kind, name: '', data: { ...defaultSubtitleStyleAsset } };
}
export function AssetEditor({
  initial,
  asset,
  onClose,
  onSaved,
  voiceContext
}: {
  initial: PersonalAssetInput;
  asset?: PersonalAsset;
  voiceContext?: { provider: CreatorTtsProvider; model: string };
  onClose(): void;
  onSaved?(asset: PersonalAsset): void;
}) {
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  const library = useAssetLibrary();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<PersonalAssetInput>(
    () =>
      structuredClone({
        name: initial.name,
        kind: initial.kind,
        data: initial.data
      }) as PersonalAssetInput
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const languageNames = new Intl.DisplayNames([language], { type: 'language' });
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const title =
    draft.kind === 'dictionary'
      ? l('翻译术语表', 'Translation Glossary')
      : draft.kind === 'voice'
        ? l('我的音色', 'My voices')
        : l('字幕样式', 'Subtitle styles');
  async function save() {
    if (!library?.available || library.loading || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = asset
        ? await library.update(asset, draft)
        : await library.create(draft);
      onSaved?.(result);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  const changeStyle = (patch: Partial<SubtitleStyleAssetData>) =>
    setDraft((current) =>
      current.kind === 'subtitle-style'
        ? { ...current, data: { ...current.data, ...patch } }
        : current
    );
  return createPortal(
    <dialog
      className="asset-editor"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="asset-editor-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <header>
          <h2 id="asset-editor-title">{title}</h2>
          <button
            type="button"
            aria-label={l('关闭', 'Close')}
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="asset-editor-body">
          <label>
            {l('名称', 'Name')}
            <input
              autoFocus
              required
              maxLength={160}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          {draft.kind === 'dictionary' ? (
            <>
              <div className="asset-section-heading">
                <span>
                  {l('术语', 'Terms')} · {draft.data.entries.length}
                </span>
                <button
                  type="button"
                  disabled={draft.data.entries.length >= 1000}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      data: {
                        entries: [
                          ...draft.data.entries,
                          {
                            source: '',
                            targetLanguage: '*',
                            translation: '',
                            preserveOriginal: false,
                            note: ''
                          }
                        ]
                      }
                    })
                  }
                >
                  <Plus size={14} />
                  {l('添加术语', 'Add term')}
                </button>
              </div>
              <div className="asset-terms">
                {draft.data.entries.map((entry, index) => (
                  <fieldset key={index} className="asset-term">
                    <label>
                      {l('原文术语', 'Source term')}
                      <input
                        required
                        maxLength={160}
                        value={entry.source}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            data: {
                              entries: draft.data.entries.map((item, i) =>
                                i === index
                                  ? { ...item, source: event.target.value }
                                  : item
                              )
                            }
                          })
                        }
                      />
                    </label>
                    <label>
                      {l('目标语言', 'Target language')}
                      <select
                        value={entry.targetLanguage}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            data: {
                              entries: draft.data.entries.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      targetLanguage: event.target.value
                                    }
                                  : item
                              )
                            }
                          })
                        }
                      >
                        {[
                          ...new Set([
                            ...dictionaryLanguages,
                            entry.targetLanguage
                          ])
                        ].map((code) => (
                          <option key={code} value={code}>
                            {code === '*'
                              ? l('所有语言', 'All languages')
                              : (languageNames.of(code.replace('_', '-')) ??
                                code)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {l('指定译文', 'Preferred translation')}
                      <input
                        required={!entry.preserveOriginal}
                        disabled={entry.preserveOriginal}
                        maxLength={500}
                        value={entry.translation}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            data: {
                              entries: draft.data.entries.map((item, i) =>
                                i === index
                                  ? { ...item, translation: event.target.value }
                                  : item
                              )
                            }
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={l('删除术语', 'Delete term')}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          data: {
                            entries: draft.data.entries.filter(
                              (_, i) => i !== index
                            )
                          }
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                    <label className="asset-check">
                      <input
                        type="checkbox"
                        checked={entry.preserveOriginal}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            data: {
                              entries: draft.data.entries.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      preserveOriginal: event.target.checked
                                    }
                                  : item
                              )
                            }
                          })
                        }
                      />
                      {l('保留原文', 'Preserve original')}
                    </label>
                    <label className="asset-term-note">
                      {l('备注', 'Note')}
                      <input
                        maxLength={1000}
                        value={entry.note}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            data: {
                              entries: draft.data.entries.map((item, i) =>
                                i === index
                                  ? { ...item, note: event.target.value }
                                  : item
                              )
                            }
                          })
                        }
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
            </>
          ) : draft.kind === 'voice' ? (
            <>
              <p className="asset-help">
                {l(
                  '填写服务商中已创建的音色或克隆音色 ID。试听与生成使用对应服务商。',
                  'Register an existing provider voice or cloned voice ID. Preview and generation use that provider.'
                )}
              </p>
              <div className="asset-fields">
                <label>
                  {l('服务商', 'Provider')}
                  <select
                    disabled={!!voiceContext}
                    value={draft.data.provider}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        data: {
                          ...draft.data,
                          provider: event.target
                            .value as typeof draft.data.provider
                        }
                      })
                    }
                  >
                    {creatorTtsProviders
                      .filter((p) => p !== 'edge-tts')
                      .map((provider) => (
                        <option key={provider}>{provider}</option>
                      ))}
                  </select>
                </label>
                <label>
                  {l('模型', 'Model')}
                  <input
                    disabled={!!voiceContext}
                    required
                    maxLength={160}
                    value={draft.data.model}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        data: { ...draft.data, model: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  {l('音色 ID', 'Voice ID')}
                  <input
                    required
                    maxLength={160}
                    value={draft.data.voiceId}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        data: { ...draft.data, voiceId: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  {l('语言', 'Audio language')}
                  <input
                    maxLength={35}
                    value={draft.data.language}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        data: { ...draft.data, language: event.target.value }
                      })
                    }
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <StyleAssetPreview style={draft.data} />
              <div className="asset-fields">
                <label>
                  {l('字幕字体', 'Subtitle font')}
                  <select
                    value={draft.data.subtitleFont}
                    onChange={(e) =>
                      changeStyle({
                        subtitleFont: e.target
                          .value as SubtitleStyleAssetData['subtitleFont']
                      })
                    }
                  >
                    {(['system', 'sans', 'serif', 'rounded'] as const).map(
                      (value, i) => (
                        <option key={value} value={value}>
                          {
                            [
                              l('系统字体', 'System'),
                              l('无衬线', 'Sans serif'),
                              l('衬线', 'Serif'),
                              l('圆体', 'Rounded')
                            ][i]
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label>
                  {l('字重', 'Font weight')}
                  <select
                    value={draft.data.subtitleWeight}
                    onChange={(e) =>
                      changeStyle({
                        subtitleWeight: e.target
                          .value as SubtitleStyleAssetData['subtitleWeight']
                      })
                    }
                  >
                    {(['regular', 'medium', 'bold'] as const).map((v, i) => (
                      <option key={v} value={v}>
                        {
                          [
                            l('常规', 'Regular'),
                            l('中等', 'Medium'),
                            l('加粗', 'Bold')
                          ][i]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {l('字幕大小', 'Subtitle size')}
                  <select
                    value={draft.data.subtitleSize}
                    onChange={(e) =>
                      changeStyle({
                        subtitleSize: e.target
                          .value as SubtitleStyleAssetData['subtitleSize']
                      })
                    }
                  >
                    {(['small', 'medium', 'large'] as const).map((v, i) => (
                      <option key={v} value={v}>
                        {
                          [
                            l('小', 'Small'),
                            l('中', 'Medium'),
                            l('大', 'Large')
                          ][i]
                        }
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    'subtitleColor',
                    'subtitleSecondaryColor',
                    'subtitleOutlineColor',
                    'subtitleShadowColor'
                  ] as const
                ).map((key, i) => (
                  <label key={key}>
                    {
                      [
                        l('主字幕颜色', 'Translation color'),
                        l('副字幕颜色', 'Original color'),
                        l('描边颜色', 'Outline color'),
                        l('阴影颜色', 'Shadow color')
                      ][i]
                    }
                    <input
                      type="color"
                      value={draft.data[key]}
                      onChange={(e) => changeStyle({ [key]: e.target.value })}
                    />
                  </label>
                ))}
                {(
                  [
                    'subtitleOutlineWidth',
                    'subtitleShadowOpacity',
                    'subtitleShadowOffsetX',
                    'subtitleShadowOffsetY',
                    'subtitleShadowBlur'
                  ] as const
                ).map((key, i) => (
                  <label key={key}>
                    {
                      [
                        l('描边宽度', 'Outline width'),
                        l('不透明度', 'Opacity'),
                        l('水平偏移', 'Horizontal offset'),
                        l('垂直偏移', 'Vertical offset'),
                        l('模糊', 'Blur')
                      ][i]
                    }
                    <input
                      type="number"
                      min={i === 2 || i === 3 ? -20 : 0}
                      max={[12, 1, 20, 20, 30][i]}
                      step={0.1}
                      value={draft.data[key]}
                      onChange={(e) =>
                        changeStyle({ [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <label className="asset-check">
                  <input
                    type="checkbox"
                    checked={draft.data.subtitleShadowEnabled}
                    onChange={(e) =>
                      changeStyle({ subtitleShadowEnabled: e.target.checked })
                    }
                  />
                  {l('字幕阴影', 'Subtitle shadow')}
                </label>
              </div>
            </>
          )}
          {failed ? (
            <p role="alert">
              {l(
                '资产保存失败，请检查内容或重新加载后重试。',
                'Could not save the asset. Check the content or reload and retry.'
              )}
            </p>
          ) : null}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {l('取消', 'Cancel')}
          </button>
          <button
            className="button-primary"
            type="submit"
            disabled={
              busy ||
              library?.loading ||
              !library?.available ||
              !draft.name.trim() ||
              (draft.kind === 'voice' && !draft.data.model.trim())
            }
          >
            {busy ? l('正在保存…', 'Saving…') : l('保存', 'Save')}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body
  );
}
