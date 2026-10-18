import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Captions,
  Copy,
  Download,
  Library,
  Mic2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2
} from 'lucide-react';
import type { PersonalAsset, PersonalAssetKind } from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog.js';
import { useAssetLibrary } from './asset-library-context.js';
import { AssetEditor, newAsset, StyleAssetPreview } from './AssetEditor.js';
import './assets.css';

export function downloadAssetBundle(bundle: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'opencreator-assets.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AssetLibraryPage({
  voiceService
}: {
  voiceService: CreatorServicesSettingsService | null;
}) {
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  const library = useAssetLibrary();
  const [kind, setKind] = useState<PersonalAssetKind>('dictionary');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{
    asset?: PersonalAsset;
    kind: PersonalAssetKind;
  }>();
  const [selected, setSelected] = useState<string>();
  const [deleting, setDeleting] = useState<PersonalAsset>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrl = useRef('');
  const previewRequest = useRef(0);
  useEffect(
    () => () => {
      previewRequest.current++;
      if (audioRef.current?.getAttribute('src')) audioRef.current.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    },
    []
  );
  const items =
    library?.assets.filter(
      (asset) =>
        asset.kind === kind &&
        `${asset.name} ${asset.kind === 'dictionary' ? asset.data.entries.map((e) => `${e.source} ${e.translation}`).join(' ') : asset.kind === 'voice' ? asset.data.voiceId : ''}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())
    ) ?? [];
  const current = items.find((asset) => asset.id === selected) ?? items[0];
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setFailed(false);
    try {
      await operation();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  async function preview(asset: Extract<PersonalAsset, { kind: 'voice' }>) {
    const request = ++previewRequest.current;
    await run(async () => {
      if (!voiceService) throw new Error('Voice service unavailable');
      const response = await voiceService.previewTtsVoice({
        provider: asset.data.provider,
        model: asset.data.model,
        voiceId: asset.data.voiceId
      });
      if (!response.ok) throw new Error('Voice preview failed');
      const blob = await response.blob();
      if (request !== previewRequest.current) return;
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = audioUrl.current;
        await audioRef.current.play();
      }
    });
  }
  const labels = [
    l('翻译术语表', 'Translation Glossary'),
    l('我的音色', 'My voices'),
    l('字幕样式', 'Subtitle styles')
  ];
  const createButton = (
    <button
      type="button"
      className="asset-create-button"
      disabled={busy || !library?.available || library.loading}
      onClick={() => setEditor({ kind })}
    >
      <Plus size={15} aria-hidden="true" />
      {kind === 'dictionary'
        ? l('新建词典', 'New glossary')
        : kind === 'voice'
          ? l('新建音色', 'New voice')
          : l('新建字幕样式', 'New subtitle style')}
    </button>
  );
  return (
    <main className="asset-library">
      <header className="asset-page-header">
        <div>
          <h1>{l('资产', 'Assets')}</h1>
          <p>
            {l(
              '跨项目复用，保存在本机。',
              'Reuse across projects. Stored on this device.'
            )}
          </p>
        </div>
      </header>
      <div className="asset-toolbar">
        <div
          className="asset-tabs"
          role="tablist"
          aria-label={l('资产类型', 'Asset type')}
        >
          {(['dictionary', 'voice', 'subtitle-style'] as const).map(
            (value, i) => {
              const Icon = [BookOpen, Mic2, Captions][i]!;
              return (
                <button
                  role="tab"
                  aria-selected={kind === value}
                  key={value}
                  onClick={() => {
                    setKind(value);
                    setSelected(undefined);
                  }}
                >
                  <Icon size={16} />
                  {labels[i]}
                  <span>
                    {library?.assets.filter((a) => a.kind === value).length ??
                      0}
                  </span>
                </button>
              );
            }
          )}
        </div>
        <label className="asset-search">
          <Search size={16} />
          <input
            aria-label={l('搜索资产', 'Search assets')}
            placeholder={l('搜索资产', 'Search assets')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {library?.failed || failed ? (
        <div className="asset-error" role="alert">
          {l('资产操作失败，请重试。', 'Asset operation failed. Please retry.')}
          <button onClick={() => void run(() => library!.reload())}>
            {l('重新加载', 'Reload')}
          </button>
        </div>
      ) : null}
      {library?.loading ? (
        <p role="status">{l('正在加载', 'Loading')}</p>
      ) : items.length === 0 ? (
        <div className="asset-empty">
          <Library size={32} />
          <h2>
            {query
              ? l('没有匹配结果', 'No matches')
              : l('还没有资产', 'No assets yet')}
          </h2>
          <p>
            {kind === 'voice'
              ? l(
                  '填写服务商中已创建的音色或克隆音色 ID。试听与生成使用对应服务商。',
                  'Register an existing provider voice or cloned voice ID. Preview and generation use that provider.'
                )
              : l(
                  '将常用设置保存为资产，在创作时直接使用。',
                  'Save your go-to settings as assets and use them while creating.'
                )}
          </p>
          {createButton}
        </div>
      ) : (
        <div className="asset-browser">
          <div className="asset-list">
            {items.map((asset) => (
              <button
                className="asset-list-row"
                key={asset.id}
                aria-pressed={current?.id === asset.id}
                onClick={() => setSelected(asset.id)}
              >
                <span className="asset-row-icon">
                  {asset.kind === 'dictionary' ? (
                    <BookOpen size={20} />
                  ) : asset.kind === 'voice' ? (
                    <Mic2 size={20} />
                  ) : (
                    <Captions size={20} />
                  )}
                </span>
                <span>
                  <strong>{asset.name}</strong>
                  <small>
                    {asset.kind === 'dictionary'
                      ? `${asset.data.entries.length} · ${l('术语', 'Terms')}`
                      : asset.kind === 'voice'
                        ? `${asset.data.provider} · ${asset.data.model}`
                        : l('字幕样式', 'Subtitle styles')}
                  </small>
                </span>
                <small>
                  {new Intl.DateTimeFormat(language, {
                    month: 'short',
                    day: 'numeric'
                  }).format(new Date(asset.updatedAt))}
                </small>
              </button>
            ))}
            {createButton}
          </div>
          {current ? (
            <section className="asset-detail">
              <header>
                <h2>{current.name}</h2>
                <div className="asset-actions">
                  <button
                    disabled={busy}
                    title={l('编辑', 'Edit')}
                    aria-label={l('编辑', 'Edit')}
                    onClick={() =>
                      setEditor({ kind: current.kind, asset: current })
                    }
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    disabled={busy}
                    title={l('复制', 'Copy')}
                    aria-label={l('复制', 'Copy')}
                    onClick={() =>
                      void run(async () => {
                        const { kind, data, name } = current;
                        const copy = await library!.create({
                          kind,
                          data,
                          name: `${name.slice(0, 140)} (${l('副本', 'Copy')})`
                        } as typeof current);
                        setSelected(copy.id);
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    title={l('导出', 'Export')}
                    aria-label={l('导出', 'Export')}
                    onClick={() => {
                      const { name, kind, data } = current;
                      downloadAssetBundle({
                        format: 'opencreator-assets',
                        version: 1,
                        assets: [{ name, kind, data }]
                      });
                    }}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    disabled={busy}
                    title={l('删除', 'Delete')}
                    aria-label={l('删除', 'Delete')}
                    onClick={() => setDeleting(current)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>
              {current.kind === 'subtitle-style' ? (
                <StyleAssetPreview style={current.data} />
              ) : current.kind === 'voice' ? (
                <div className="asset-voice-detail">
                  <Mic2 size={40} />
                  <dl>
                    <dt>{l('服务商', 'Provider')}</dt>
                    <dd>{current.data.provider}</dd>
                    <dt>{l('模型', 'Model')}</dt>
                    <dd>{current.data.model}</dd>
                    <dt>{l('音色 ID', 'Voice ID')}</dt>
                    <dd>{current.data.voiceId}</dd>
                    <dt>{l('语言', 'Audio language')}</dt>
                    <dd>{current.data.language || '—'}</dd>
                  </dl>
                  <button
                    disabled={busy || !voiceService}
                    onClick={() => void preview(current)}
                  >
                    <Play size={15} />
                    {l('试听', 'Preview')}
                  </button>
                </div>
              ) : (
                <div className="asset-dictionary-preview">
                  {current.data.entries.length === 0 ? (
                    <p>{l('添加术语', 'Add term')}</p>
                  ) : (
                    current.data.entries.map((entry, i) => (
                      <div key={i}>
                        <strong>{entry.source}</strong>
                        <span>
                          {entry.preserveOriginal
                            ? entry.source
                            : entry.translation}
                        </span>
                        <small>
                          {entry.targetLanguage === '*'
                            ? l('所有语言', 'All languages')
                            : entry.targetLanguage}
                          {entry.note ? ` · ${entry.note}` : ''}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
      <audio ref={audioRef} controls className="asset-audio" />
      {editor ? (
        <AssetEditor
          initial={editor.asset ?? newAsset(editor.kind)}
          asset={editor.asset}
          onClose={() => setEditor(undefined)}
          onSaved={(asset) => setSelected(asset.id)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== undefined}
        title={l('删除资产？', 'Delete asset?')}
        description={l(
          '旧任务中使用的设置会保留。',
          'Settings used in previous tasks will be preserved.'
        )}
        confirmLabel={l('删除', 'Delete')}
        destructive
        busy={busy}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() =>
          void run(async () => {
            await library?.remove(deleting!);
            setDeleting(undefined);
          })
        }
      />
    </main>
  );
}
