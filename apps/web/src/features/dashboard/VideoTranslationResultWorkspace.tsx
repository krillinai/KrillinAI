import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';
import {
  Captions,
  ArrowLeft,
  Download,
  FileAudio,
  FileVideo,
  Maximize2,
  MessageSquare,
  Mic2,
  PackageOpen,
  RotateCcw,
  Save,
  Settings2,
  X,
  Redo2,
  Undo2
} from 'lucide-react';
import { useLocalizedCopy, type LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import CreatorResultVersionMenu from './CreatorResultVersionMenu.js';
import { OriginalErrorDetails } from '../issues/OriginalErrorDetails.js';
import SubtitleTimeline from './SubtitleTimeline.js';
import { sameSubtitleCues, subtitleSeconds } from './subtitle-editing.js';
import { beginPaneResize, paneInlineDirection } from '../../components/layout/pane-resize-2026-07-29.js';
import './subtitle-editor.css';

export type VideoTranslationResultTab = 'video' | 'subtitles' | 'voice' | 'settings';
export type VideoResultVariant = 'horizontal' | 'vertical' | 'dubbed';
export type SubtitleResultVariant = 'horizontal' | 'vertical';

export type VideoTranslationResultExecution = {
  status: 'queued' | 'running' | 'needs_input' | 'failed' | 'canceled' | 'interrupted';
  stageLabel: string;
};

export type SubtitleCue = {
  id: number;
  start: string;
  end: string;
  text: string;
  sourceText?: string;
};

type VersionItem = {
  value: number;
  description: string;
};

export type VideoResultOutput = {
  artifactId: string;
  variant: VideoResultVariant;
  artifactVersion: number;
  fileName?: string;
  src?: string;
  previewLoading?: boolean;
  previewError?: string;
};

export type SubtitleResultOutput = {
  artifactId: string;
  variant: SubtitleResultVariant;
  artifactVersion: number;
  fileName?: string;
  cues: SubtitleCue[];
  readOnly: boolean;
  translationPosition?: 'top' | 'bottom';
};

export type SubtitleVideoPreview = {
  artifactId: string;
  src?: string;
  previewLoading?: boolean;
  previewError?: string;
  source: boolean;
};

export type VoiceResultOutput = {
  artifactId: string;
  artifactVersion: number;
  fileName?: string;
  src?: string;
  previewLoading?: boolean;
  previewError?: string;
};

const resultTabs: Array<{
  value: VideoTranslationResultTab;
  label: string;
  icon: typeof FileVideo;
}> = [
  { value: 'video', label: '作品', icon: PackageOpen },
  { value: 'subtitles', label: '字幕', icon: Captions },
  { value: 'voice', label: '配音', icon: Mic2 },
  { value: 'settings', label: '任务设置', icon: Settings2 }
];

export default function VideoTranslationResultWorkspace(props: {
  subtitleOnly?: boolean;
  subtitleDownloads?: Array<{ artifactId: string; label: string }>;
  activeTab: VideoTranslationResultTab;
  version: number;
  versions: VersionItem[];
  targetLanguage: string;
  outputLabel: string;
  subtitleStyleLabel: string;
  dubbing: boolean;
  hasVoiceArtifact: boolean;
  videoOutputs: VideoResultOutput[];
  subtitleOutputs: SubtitleResultOutput[];
  subtitleVideoPreviews: Partial<Record<SubtitleResultVariant, SubtitleVideoPreview>>;
  previewPreparation?: { pending: boolean; blocked?: boolean; error?: string; errorDetail?: string };
  voiceOutput?: VoiceResultOutput;
  subtitleDirty: boolean;
  subtitleDirtyByVariant: Partial<Record<SubtitleResultVariant, boolean>>;
  subtitleSavePending?: boolean;
  immersive?: boolean;
  assistantOpen?: boolean;
  editorSettings?: { style: ReactNode; voice: ReactNode; disabled: boolean; onOpen(): void };
  renderSubtitlePreview?(cues: SubtitleCue[], width: number, height: number): ReactNode;
  onImmersiveChange?(value: boolean): void;
  onToggleAssistant?(): void;
  onSubtitleCuesChange?(variant: SubtitleResultVariant, cues: SubtitleCue[]): void;
  nextVersion: number;
  affectedArtifacts: string[];
  hasPendingChanges: boolean;
  regenerationPending: boolean;
  execution?: VideoTranslationResultExecution;
  notice?: string;
  onTabChange(tab: VideoTranslationResultTab): void;
  onVersionChange(version: number): void;
  onSubtitleChange(variant: SubtitleResultVariant, id: number, text: string, field?: 'text' | 'sourceText'): void;
  onSaveSubtitles(variant: SubtitleResultVariant): void;
  onAdjustSettings(): void;
  onExport(type: 'video' | 'subtitles' | 'voice', artifactId?: string): void;
  onReloadVoice(): void;
  onPrepareSourceVideo?(): void;
  onRequestRegenerate(): void;
  onCancelRegenerate(): void;
  onConfirmRegenerate(): void;
}) {
  const l = useLocalizedCopy();
  const availableSubtitleVariants = props.subtitleOutputs.map(output => output.variant);
  const availableSubtitleVariantKey = availableSubtitleVariants.join('|');
  const [selectedSubtitleVariant, setSelectedSubtitleVariant] = useState<SubtitleResultVariant>('horizontal');
  const [subtitlePlaybackTime, setSubtitlePlaybackTime] = useState(0);
  const [subtitleDuration, setSubtitleDuration] = useState(0);
  const [subtitlePlaying, setSubtitlePlaying] = useState(false);
  const [editorPanel, setEditorPanel] = useState<'style' | 'voice'>();
  const [subtitleVideoSize, setSubtitleVideoSize] = useState({ width: 16, height: 9 });
  const [auditionVoice, setAuditionVoice] = useState(false);
  const [voicePlaybackFailed, setVoicePlaybackFailed] = useState(false);
  const [selectedCueId, setSelectedCueId] = useState<number>();
  const [editorWidth, setEditorWidth] = useState(60);
  const [, setHistoryRevision] = useState(0);
  const history = useRef(new Map<string, { past: SubtitleCue[][]; future: SubtitleCue[][] }>());
  const rootRef = useRef<HTMLElement>(null);
  const previewLayoutRef = useRef<HTMLDivElement>(null);
  const immersiveButtonRef = useRef<HTMLButtonElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const subtitleVideoRef = useRef<HTMLVideoElement>(null);
  const subtitleAudioRef = useRef<HTMLAudioElement>(null);
  const subtitleCueRefs = useRef(new Map<number, HTMLElement>());
  const activeSubtitleVariant = availableSubtitleVariants.includes(selectedSubtitleVariant)
    ? selectedSubtitleVariant
    : availableSubtitleVariants.includes('horizontal')
      ? 'horizontal'
      : availableSubtitleVariants[0];
  const activeSubtitleOutput = props.subtitleOutputs.find(output => output.variant === activeSubtitleVariant);
  const historyKey = `${props.version}:${activeSubtitleVariant}`;
  const currentHistory = history.current.get(historyKey);
  const editReadOnly = activeSubtitleOutput?.readOnly === true || props.subtitleSavePending === true;
  const activeSubtitleLabel = props.subtitleOnly ? l('字幕', 'Subtitles')
    : subtitleVariantLabel(activeSubtitleOutput?.variant ?? 'horizontal', l);
  const activeSubtitleDirty = activeSubtitleVariant === undefined
    ? false
    : props.subtitleDirtyByVariant[activeSubtitleVariant] === true;
  const hasSubtitleDrafts = Object.values(props.subtitleDirtyByVariant).some(Boolean);
  const activeSubtitleVideo = activeSubtitleVariant === undefined
    ? undefined
    : props.subtitleVideoPreviews[activeSubtitleVariant];
  const activeSubtitleCues = activeSubtitleOutput?.cues.filter(cue => (
    subtitlePlaybackTime >= subtitleTimestampSeconds(cue.start)
    && subtitlePlaybackTime < subtitleTimestampSeconds(cue.end)
  )) ?? [];
  const activeSubtitleCueIds = new Set(activeSubtitleCues.map(cue => cue.id));
  const activeSubtitleCueKey = activeSubtitleCues.map(cue => cue.id).join('|');
  const subtitleCueGroups = activeSubtitleOutput === undefined
    ? []
    : groupSubtitleCues(activeSubtitleOutput.cues, activeSubtitleOutput.variant);
  const subtitleCueCount = props.subtitleOutputs.reduce((total, output) => total + output.cues.length, 0);
  const generatedArtifactCount = props.videoOutputs.length
    + props.subtitleOutputs.length
    + (props.voiceOutput === undefined ? 0 : 1);
  const outputEmptyTitle = emptyResultTitle('video', props.execution?.status, l);
  const subtitleEmptyTitle = emptyResultTitle('subtitles', props.execution?.status, l);
  const voiceEmptyTitle = props.dubbing
    ? emptyResultTitle('voice', props.execution?.status, l)
    : l('此版本未开启配音', 'Dubbing is disabled for this version');
  const executionDetail = props.execution === undefined ? undefined
    : props.execution.status === 'failed'
      ? l('查看任务面板中的错误详情后重试。', 'Check the error in the task panel and retry.')
      : props.execution.status === 'needs_input'
        ? l('请先处理任务面板中的待办事项。', 'Resolve the pending action in the task panel to continue.')
        : props.execution.status === 'canceled' || props.execution.status === 'interrupted'
          ? l('可在任务面板中继续任务。', 'Resume the task from the task panel.')
          : l(`当前阶段：${props.execution.stageLabel}`, `Current stage: ${props.execution.stageLabel}`);

  useEffect(() => {
    setSelectedSubtitleVariant(availableSubtitleVariants.includes('horizontal')
      ? 'horizontal'
      : availableSubtitleVariants[0] ?? 'horizontal');
  }, [availableSubtitleVariantKey, props.version]);

  useEffect(() => {
    setSubtitlePlaybackTime(0);
    setSubtitleDuration(0);
    setSubtitlePlaying(false);
    setSelectedCueId(undefined);
  }, [activeSubtitleVariant, activeSubtitleVideo?.src, props.version]);

  useEffect(() => { setAuditionVoice(false); setVoicePlaybackFailed(false); }, [props.voiceOutput?.src, props.version]);

  useEffect(() => {
    const video = subtitleVideoRef.current;
    if (!props.immersive || !auditionVoice || !props.voiceOutput?.src || !video) return;
    const muted = video.muted;
    video.muted = true;
    return () => { video.muted = muted; };
  }, [props.immersive, auditionVoice, props.voiceOutput?.src, activeSubtitleVideo?.src, activeSubtitleVariant, props.version]);

  useEffect(() => {
    const audio = subtitleAudioRef.current;
    if (!audio) return;
    let active = true;
    if (props.immersive && auditionVoice && subtitlePlaying) {
      audio.currentTime = subtitleVideoRef.current?.currentTime ?? 0;
      audio.playbackRate = subtitleVideoRef.current?.playbackRate ?? 1;
      void audio.play().catch(() => { if (active) { setVoicePlaybackFailed(true); setAuditionVoice(false); } });
    } else audio.pause();
    return () => { active = false; audio.pause(); };
  }, [props.immersive, auditionVoice, subtitlePlaying, props.voiceOutput?.src, activeSubtitleVideo?.src, activeSubtitleVariant, props.version]);

  useEffect(() => {
    if (!props.immersive) return;
    returnButtonRef.current?.focus();
    const main = rootRef.current?.closest('.video-translation-page');
    const siblings: HTMLElement[] = [];
    let node: Element | null | undefined = main;
    while (node && node !== document.body) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')
          && !sibling.matches('.desktop-titlebar-drag-region, .opencreator-main-titlebar')) {
          sibling.setAttribute('inert', ''); siblings.push(sibling);
        }
      }
      node = node.parentElement;
    }
    return () => {
      siblings.forEach(sibling => sibling.removeAttribute('inert'));
      immersiveButtonRef.current?.focus();
    };
  }, [props.immersive]);

  useEffect(() => {
    if (props.immersive && (props.activeTab !== 'subtitles' || !activeSubtitleOutput)) props.onImmersiveChange?.(false);
  }, [props.immersive, props.activeTab, activeSubtitleOutput === undefined]);

  useEffect(() => {
    if (activeSubtitleCues.length === 0) return;
    subtitleCueRefs.current.get(activeSubtitleCues[0]!.id)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeSubtitleCueKey]);

  const seekToSubtitleCue = (cue: SubtitleCue) => {
    setSelectedCueId(cue.id);
    const start = subtitleTimestampSeconds(cue.start);
    seekSubtitle(start);
  };

  function seekSubtitle(time: number) {
    if (!Number.isFinite(time)) return;
    if (subtitleVideoRef.current !== null) subtitleVideoRef.current.currentTime = Math.min(time, subtitleDuration || time);
    syncVoiceTime(time, true);
    setSubtitlePlaybackTime(time);
  }

  function syncVoiceTime(time: number, force = false) {
    const audio = subtitleAudioRef.current;
    if (audio && (force || auditionVoice) && Math.abs(audio.currentTime - time) > .25) {
      audio.currentTime = Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time);
    }
  }

  function replaceCues(cues: SubtitleCue[]) {
    if (!activeSubtitleOutput || editReadOnly || !props.onSubtitleCuesChange || sameSubtitleCues(activeSubtitleOutput.cues, cues)) return;
    const entry = history.current.get(historyKey) ?? { past: [], future: [] };
    entry.past = [...entry.past.slice(-59), activeSubtitleOutput.cues];
    entry.future = [];
    history.current.set(historyKey, entry);
    setHistoryRevision(value => value + 1);
    props.onSubtitleCuesChange(activeSubtitleOutput.variant, cues);
  }

  function editText(cue: SubtitleCue, text: string, field: 'text' | 'sourceText' = 'text') {
    if (!activeSubtitleOutput || editReadOnly) return;
    if (props.onSubtitleCuesChange) replaceCues(activeSubtitleOutput.cues.map(item => item.id === cue.id ? { ...item, [field]: text } : item));
    else if (field === 'sourceText') props.onSubtitleChange(activeSubtitleOutput.variant, cue.id, text, field);
    else props.onSubtitleChange(activeSubtitleOutput.variant, cue.id, text);
  }

  function travelHistory(direction: 'past' | 'future') {
    if (!activeSubtitleOutput || editReadOnly || !props.onSubtitleCuesChange) return;
    const entry = history.current.get(historyKey);
    const next = entry?.[direction].pop();
    if (!next || !entry) return;
    entry[direction === 'past' ? 'future' : 'past'].push(activeSubtitleOutput.cues);
    setHistoryRevision(value => value + 1);
    props.onSubtitleCuesChange(activeSubtitleOutput.variant, next);
  }

  return (
    <section ref={rootRef} className="video-result-workspace" data-immersive={props.immersive || undefined}
      aria-label={l('视频翻译项目产出', 'Video translation project outputs')}
      onKeyDown={event => {
        if (!props.immersive || event.defaultPrevented) return;
        if (event.key === 'Escape' && !document.querySelector('[role="dialog"], dialog[open]')) {
          event.preventDefault(); props.onImmersiveChange?.(false);
        }
        const target = event.target as HTMLElement;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !target.matches('input, textarea, [contenteditable="true"]')) {
          event.preventDefault(); travelHistory(event.shiftKey ? 'future' : 'past');
        }
      }}>
      <div className="video-result-toolbar">
        <div className="video-result-tabs" role="tablist" aria-label={l('产出物类型', 'Output types')}>
          {resultTabs.filter(tab => !props.subtitleOnly || tab.value === 'subtitles' || tab.value === 'settings').map(tab => {
            const Icon = tab.icon;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={props.activeTab === tab.value}
                key={tab.value}
                onClick={() => props.onTabChange(tab.value)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                {localizeResultTab(tab.label, l)}
                {tab.value === 'subtitles' && hasSubtitleDrafts ? (
                  <span className="video-result-unsaved" aria-label={l('有未保存的字幕修改', 'Unsaved subtitle changes')} />
                ) : null}
              </button>
            );
          })}
        </div>

        <CreatorResultVersionMenu
          showCompletion={props.execution === undefined && generatedArtifactCount > 0}
          version={props.version}
          versions={props.versions}
          onVersionChange={props.onVersionChange}
        />
      </div>

      {props.notice ? <p className="video-result-notice" role="status">{props.notice}</p> : null}

      {props.activeTab === 'video' ? (
        <div className="video-result-pane">
          {generatedArtifactCount > 0 && props.execution ? (
            <p className="video-result-notice" role="status">{outputEmptyTitle} · {executionDetail}</p>
          ) : null}
          {generatedArtifactCount > 0 ? (
            <div className="video-result-generated-sections">
              {props.videoOutputs.length > 0 ? (
                <section className="video-result-generated-section" aria-label={l('成片', 'Videos')}>
                  <div className="video-result-video-grid">
                    {props.videoOutputs.map(output => {
                      const artifactLabel = videoVariantArtifactLabel(output.variant, l);
                      return (
                        <section className="video-result-output-column" aria-label={artifactLabel} data-variant={output.variant} key={output.artifactId}>
                          <div className="video-result-player-frame" data-ratio={output.variant === 'vertical' ? '9:16' : '16:9'}>
                            {output.src !== undefined ? (
                              <video
                                className="video-result-player"
                                src={output.src}
                                controls
                                preload="metadata"
                                aria-label={l(`${artifactLabel}预览`, `${artifactLabel} preview`)}
                              />
                            ) : (
                              <div className="video-result-player-status" role="status">
                                {output.previewLoading
                                  ? l(`正在加载${artifactLabel}...`, `Loading ${artifactLabel}...`)
                                  : output.previewError ?? l('成片预览暂时不可用，可直接下载文件。', 'Video preview is unavailable. You can still download the file.')}
                              </div>
                            )}
                          </div>
                          <div className="video-result-file-row">
                            <span aria-hidden="true"><FileVideo size={19} strokeWidth={1.7} /></span>
                            <div>
                              <strong title={output.fileName}>{output.fileName ?? `${artifactLabel}-${props.targetLanguage}-V${props.version}.mp4`}</strong>
                              <small>{videoVariantFormatLabel(output.variant, l)}</small>
                            </div>
                            <button
                              type="button"
                              onClick={() => props.onExport('video', output.artifactId)}
                              aria-label={l(`下载${artifactLabel}`, `Download ${artifactLabel}`)}
                              title={l(`下载${artifactLabel}`, `Download ${artifactLabel}`)}
                            >
                              <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                            </button>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {props.subtitleOutputs.length > 0 ? (
                <section className="video-result-generated-section">
                  <h3>{l('字幕', 'Subtitles')}</h3>
                  <div className="video-result-generated-file-grid">
                    {props.subtitleOutputs.map(output => {
                      const variantLabel = subtitleVariantLabel(output.variant, l);
                      return (
                        <div className="video-result-file-row" key={output.artifactId}>
                          <span aria-hidden="true"><Captions size={19} strokeWidth={1.7} /></span>
                          <div>
                            <strong title={output.fileName}>{output.fileName ?? `${variantLabel}-V${props.version}.srt`}</strong>
                            <small>{variantLabel}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => props.onExport('subtitles', output.artifactId)}
                            aria-label={l(`下载${variantLabel}`, `Download ${variantLabel}`)}
                            title={l(`下载${variantLabel}`, `Download ${variantLabel}`)}
                          >
                            <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {props.voiceOutput !== undefined ? (
                <section className="video-result-generated-section">
                  <h3>{l('配音', 'Dubbing')}</h3>
                  <div className="video-result-generated-file-grid">
                    <div className="video-result-file-row">
                      <span aria-hidden="true"><FileAudio size={19} strokeWidth={1.7} /></span>
                      <div>
                        <strong title={props.voiceOutput.fileName}>{props.voiceOutput.fileName ?? `${l('目标语言配音', 'Target-language-dubbing')}-V${props.version}.wav`}</strong>
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onExport('voice', props.voiceOutput?.artifactId)}
                        aria-label={l('下载配音文件', 'Download dubbing file')}
                        title={l('下载配音文件', 'Download dubbing file')}
                      >
                        <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="video-result-empty" role="status">
              <PackageOpen size={26} strokeWidth={1.5} aria-hidden="true" />
              <strong>{outputEmptyTitle}</strong>
              {executionDetail ? <p>{executionDetail}</p> : null}
            </div>
          )}
        </div>
      ) : null}

      {props.activeTab === 'subtitles' ? (
        <div className="video-result-pane video-result-subtitle-pane">
          <header className="video-result-pane-heading">
            <div>
              {props.immersive ? <button ref={returnButtonRef} type="button" className="subtitle-editor-back" onClick={() => props.onImmersiveChange?.(false)}>
                <ArrowLeft size={17} />{l('返回项目', 'Back to project')}
              </button> : null}
              <h2>{props.immersive ? l('字幕编辑', 'Subtitle editor') : l('字幕', 'Subtitles')}</h2>
              <p>
                {l('项目', 'Project')} V{props.version}
                {' · '}{activeSubtitleOutput?.cues.length ?? 0} {l('条字幕', 'subtitles')}
                {activeSubtitleOutput === undefined
                  ? ''
                  : ` · ${activeSubtitleDirty
                    ? l('有未保存修改', 'Unsaved changes')
                    : l('已保存', 'Saved')}`}
                {activeSubtitleOutput?.readOnly ? ` · ${l('只读', 'Read only')}` : ''}
              </p>
            </div>
            <div className="video-result-pane-actions">
              {props.immersive ? <>
                <div className="subtitle-editor-history">
                  <button type="button" aria-label={l('撤销', 'Undo')} title={l('撤销', 'Undo')} disabled={editReadOnly || !currentHistory?.past.length} onClick={() => travelHistory('past')}><Undo2 size={16} /></button>
                  <button type="button" aria-label={l('重做', 'Redo')} title={l('重做', 'Redo')} disabled={editReadOnly || !currentHistory?.future.length} onClick={() => travelHistory('future')}><Redo2 size={16} /></button>
                </div>
                {props.onToggleAssistant ? <button type="button" aria-pressed={props.assistantOpen} onClick={props.onToggleAssistant}>
                  <MessageSquare size={15} />{l('AI 助手', 'AI assistant')}
                </button> : null}
              </> : activeSubtitleOutput && props.onImmersiveChange ? <button ref={immersiveButtonRef} type="button" onClick={() => props.onImmersiveChange?.(true)}>
                <Maximize2 size={15} />{l('深度编辑', 'Advanced editing')}
              </button> : null}
              {props.immersive && !props.subtitleDownloads?.length && activeSubtitleOutput ? <button type="button" className="subtitle-editor-export"
                aria-label={l('导出字幕', 'Export subtitles')} title={l('导出字幕', 'Export subtitles')} disabled={hasSubtitleDrafts || props.subtitleSavePending}
                onClick={() => props.onExport('subtitles', activeSubtitleOutput.artifactId)}><Download size={15} /><span>{l('导出字幕', 'Export subtitles')}</span></button> : null}
              {props.subtitleDownloads?.map(download => <button key={download.artifactId} type="button" className="subtitle-editor-export" aria-label={download.label} title={download.label}
                disabled={hasSubtitleDrafts || props.subtitleSavePending}
                onClick={() => props.onExport('subtitles', download.artifactId)}>
                <Download size={15} aria-hidden="true" /><span>{download.label}</span>
              </button>)}
              {availableSubtitleVariants.length > 1 ? (
                <div className="video-result-subtitle-variants" role="radiogroup" aria-label={l('字幕画幅', 'Subtitle format')}>
                  {availableSubtitleVariants.map(variant => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activeSubtitleVariant === variant}
                      key={variant}
                      onClick={() => setSelectedSubtitleVariant(variant)}
                    >
                      {variant === 'horizontal' ? l('横屏', 'Horizontal') : l('竖屏', 'Vertical')}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeSubtitleOutput !== undefined && !activeSubtitleOutput.readOnly ? (
                <button
                  type="button"
                  disabled={!activeSubtitleDirty || props.subtitleSavePending}
                  onClick={() => props.onSaveSubtitles(activeSubtitleOutput.variant)}
                >
                  <Save size={15} strokeWidth={1.8} aria-hidden="true" />
                  {props.subtitleSavePending
                    ? l('正在保存...', 'Saving...')
                    : props.subtitleOnly || props.immersive ? l('保存字幕', 'Save subtitles') : l(
                        `保存${activeSubtitleOutput.variant === 'horizontal' ? '横屏' : '竖屏'}字幕`,
                        `Save ${activeSubtitleOutput.variant === 'horizontal' ? 'horizontal' : 'vertical'} subtitles`
                      )}
                </button>
              ) : null}
            </div>
          </header>
          {activeSubtitleOutput !== undefined ? (
            <div className="video-result-subtitle-preview-layout" ref={previewLayoutRef} data-subtitle-only={props.subtitleOnly || undefined}
              style={props.immersive ? { '--subtitle-editor-width': `${editorWidth}%` } as CSSProperties : undefined}>
              {!props.subtitleOnly ? <section className="video-result-subtitle-video" data-settings-open={Boolean(props.immersive && editorPanel)} aria-label={l('同步视频预览', 'Synchronized video preview')}>
                {props.immersive && props.editorSettings ? <div className="subtitle-editor-settings-nav" role="group" aria-label={l('项目设置', 'Project settings')}>
                  {(['style', 'voice'] as const).map(panel => <button key={panel} type="button" aria-expanded={editorPanel === panel}
                    aria-controls="subtitle-editor-settings-panel" onClick={() => { props.editorSettings?.onOpen(); setEditorPanel(current => current === panel ? undefined : panel); }}>
                    {panel === 'style' ? <Captions size={15} /> : <Mic2 size={15} />}
                    {panel === 'style' ? l('字幕样式', 'Subtitle style') : l('配音', 'Dubbing')}
                  </button>)}
                  {props.voiceOutput?.src ? <button type="button" className="subtitle-editor-voice-toggle" aria-pressed={auditionVoice}
                    title={l('目标语言配音试听', 'Target-language dubbing preview')} aria-label={l('目标语言配音试听', 'Target-language dubbing preview')}
                    onClick={() => { setVoicePlaybackFailed(false); setAuditionVoice(value => !value); }}><Mic2 size={15} /></button> : null}
                </div> : null}
                {props.immersive && props.voiceOutput?.src ? <audio ref={subtitleAudioRef} src={props.voiceOutput.src} preload="metadata" hidden
                  onLoadedMetadata={() => syncVoiceTime(subtitlePlaybackTime, true)}
                  onError={() => { setVoicePlaybackFailed(true); setAuditionVoice(false); }} /> : null}
                <div
                  className="video-result-player-frame"
                  data-ratio={activeSubtitleOutput.variant === 'vertical' ? '9:16' : '16:9'}
                >
                  {activeSubtitleVideo?.src !== undefined ? (
                    <>
                      <video
                        className="video-result-player"
                        key={`${props.version}-${activeSubtitleVariant}-${activeSubtitleVideo.src}`}
                        ref={subtitleVideoRef}
                        src={activeSubtitleVideo.src}
                        controls
                        preload="metadata"
                        onLoadedMetadata={event => { setSubtitlePlaybackTime(event.currentTarget.currentTime); setSubtitleDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); setSubtitleVideoSize({ width: event.currentTarget.videoWidth || 16, height: event.currentTarget.videoHeight || 9 }); }}
                        onDurationChange={event => setSubtitleDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
                        onPlay={() => setSubtitlePlaying(true)}
                        onPause={() => setSubtitlePlaying(false)}
                        onEnded={() => setSubtitlePlaying(false)}
                        onRateChange={event => { if (subtitleAudioRef.current) subtitleAudioRef.current.playbackRate = event.currentTarget.playbackRate; }}
                        onSeeked={event => { setSubtitlePlaybackTime(event.currentTarget.currentTime); syncVoiceTime(event.currentTarget.currentTime, true); }}
                        onTimeUpdate={event => { setSubtitlePlaybackTime(event.currentTarget.currentTime); syncVoiceTime(event.currentTarget.currentTime); }}
                        aria-label={l(
                          `${subtitleVariantLabel(activeSubtitleOutput.variant, l)}视频预览`,
                          `${subtitleVariantLabel(activeSubtitleOutput.variant, l)} video preview`
                        )}
                      />
                      {activeSubtitleCues.length > 0 && props.immersive && props.renderSubtitlePreview ? <div className="subtitle-editor-styled-overlay">
                        {props.renderSubtitlePreview(activeSubtitleCues, subtitleVideoSize.width, subtitleVideoSize.height)}
                      </div> : activeSubtitleCues.length > 0 ? (
                        <div className="video-result-subtitle-overlay" aria-hidden="true">
                          {activeSubtitleCues.map(cue => (
                            <span key={cue.id}>
                              {subtitleCueDisplayText(cue, activeSubtitleOutput.translationPosition)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="video-result-player-status" role="status">
                      {props.onPrepareSourceVideo !== undefined && !activeSubtitleVideo?.previewLoading ? (
                        <div className="video-result-preview-empty">
                          <strong>{l('字幕已翻译完成', 'Subtitle translation is complete')}</strong>
                          <p>{props.previewPreparation?.pending
                            ? l('正在准备原视频，仅用于同步预览，不会重新翻译。下载进度见右侧任务面板。', 'Preparing the source video for synchronized preview only. Subtitles will not be translated again. See the task panel for download progress.')
                            : props.previewPreparation?.error ?? (activeSubtitleVideo?.previewError
                              ? l('视频预览加载失败，请检查诊断信息后重试。', 'Video preview failed to load. Check the diagnostics and retry.', 'Det gick inte att läsa in videoförhandsvisningen. Kontrollera diagnostiken och försök igen.') : undefined)
                              ?? l('为节省下载时间，尚未下载原视频。下载后可同步播放和校对字幕，不影响字幕编辑与下载。', 'The source video has not been downloaded to save time. Download it to play and review subtitles in sync. Subtitle editing and export remain available.')}</p>
                          {!props.previewPreparation?.pending ? <OriginalErrorDetails detail={props.previewPreparation?.errorDetail ?? activeSubtitleVideo?.previewError} /> : null}
                          <button className="video-translation-secondary-action" type="button"
                            disabled={props.previewPreparation?.pending || props.previewPreparation?.blocked}
                            onClick={props.onPrepareSourceVideo}>
                            <Download size={15} aria-hidden="true" />
                            {props.previewPreparation?.pending ? l('正在准备…', 'Preparing…')
                              : props.previewPreparation?.error || activeSubtitleVideo?.previewError
                                ? l('重试下载原视频', 'Retry source video download')
                                : l('下载原视频并预览', 'Download source video and preview')}
                          </button>
                          {props.previewPreparation?.blocked && !props.previewPreparation.pending
                            ? <small>{l('请等待当前任务结束后再准备预览视频', 'Wait for the current task to finish before preparing the preview')}</small> : null}
                        </div>
                      ) : (
                        <>
                          {activeSubtitleVideo?.previewLoading
                            ? l('正在加载视频...', 'Loading video...')
                            : activeSubtitleVideo?.previewError
                              ?? l('当前版本没有可用于字幕同步预览的视频。', 'This version has no video available for synchronized subtitle preview.')}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {activeSubtitleVideo?.source ? (
                  <small>{l('当前使用原视频同步预览', 'Using the source video for synchronized preview')}</small>
                ) : null}
                {props.immersive && props.editorSettings && editorPanel ? <section className="subtitle-editor-settings" id="subtitle-editor-settings-panel"
                  aria-label={editorPanel === 'style' ? l('字幕样式', 'Subtitle style') : l('配音', 'Dubbing')}>
                  <header><strong>{editorPanel === 'style' ? l('字幕样式', 'Subtitle style') : l('配音', 'Dubbing')}</strong>
                    <button type="button" aria-label={l('关闭', 'Close')} onClick={() => setEditorPanel(undefined)}><X size={15} /></button></header>
                  <fieldset disabled={props.editorSettings.disabled}>
                    {editorPanel === 'style' ? props.editorSettings.style : props.editorSettings.voice}
                  </fieldset>
                  {editorPanel === 'voice' && props.voiceOutput ? <div className="subtitle-editor-voice-status">
                    <span>{props.voiceOutput.fileName ?? l('目标语言配音', 'Target-language dubbing')} · V{props.voiceOutput.artifactVersion}</span>
                    {props.voiceOutput.previewLoading ? <p role="status">{l('正在加载配音...', 'Loading dubbing...')}</p> : null}
                    {props.voiceOutput.previewError || voicePlaybackFailed ? <>
                      <p role="status">{l('配音试听暂时不可用，可直接下载文件。', 'Dubbing preview is unavailable. You can still download the file.')}</p>
                      <button type="button" onClick={props.onReloadVoice}>{l('重新加载配音', 'Reload dubbing')}</button>
                    </> : null}
                  </div> : null}
                </section> : null}
              </section> : null}

              {props.immersive && !props.subtitleOnly ? <div className="subtitle-editor-divider" role="separator" aria-orientation="vertical" tabIndex={0}
                aria-label={l('调整字幕和预览宽度', 'Resize subtitles and preview')} aria-valuemin={35} aria-valuemax={75} aria-valuenow={editorWidth}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault(); setEditorWidth(value => Math.max(35, Math.min(75, value + (event.key === 'ArrowRight' ? 2 : -2) * paneInlineDirection(previewLayoutRef.current))));
                  }
                }} onMouseDown={event => beginPaneResize(event, clientX => {
                  const rect = previewLayoutRef.current?.getBoundingClientRect();
                  if (rect) setEditorWidth(Math.max(35, Math.min(75, (paneInlineDirection(previewLayoutRef.current) === -1 ? rect.right - clientX : clientX - rect.left) / rect.width * 100)));
                })} /> : null}

              <section className="video-result-output-column" data-variant={activeSubtitleOutput.variant}>
                {props.immersive ? <div className="subtitle-editor-column-labels">
                  <span>{l('时间', 'Time')}</span>
                  {activeSubtitleOutput.cues.some(cue => cue.sourceText !== undefined) ? <span>{l('原文', 'Original text')}</span> : null}
                  <span>{l('译文', 'Translation')}</span>
                </div> : null}
                {activeSubtitleOutput.cues.length > 0 ? (
                  <div
                    className="video-subtitle-editor"
                    role="list"
                    aria-label={l(
                      `${activeSubtitleLabel}内容`,
                      `${activeSubtitleLabel} content`
                    )}
                  >
                    {subtitleCueGroups.map((group, groupIndex) => {
                      const firstCue = group[0]!.cue;
                      return (
                        <div
                          className="video-subtitle-cue"
                          role="listitem"
                          data-active={group.some(({ cue }) => activeSubtitleCueIds.has(cue.id))}
                          data-selected={group.some(({ cue }) => selectedCueId === cue.id)}
                          data-subtitle-cue="true"
                          key={firstCue.id}
                          onFocusCapture={() => setSelectedCueId(firstCue.id)}
                          ref={node => {
                            for (const { cue } of group) {
                              if (node === null) subtitleCueRefs.current.delete(cue.id);
                              else subtitleCueRefs.current.set(cue.id, node);
                            }
                          }}
                        >
                          <button
                            type="button"
                            className="video-subtitle-cue-time"
                            onClick={() => seekToSubtitleCue(firstCue)}
                            aria-label={l(`跳转到 ${firstCue.start}`, `Jump to ${firstCue.start}`)}
                          >
                            <span>{String(groupIndex + 1).padStart(2, '0')}</span>
                            <small dir="ltr" title={`${firstCue.start} - ${firstCue.end}`}>
                              {subtitleCueShortTime(firstCue.start)}–{subtitleCueShortTime(firstCue.end)}
                            </small>
                          </button>
                          <div className="video-subtitle-cue-lines">
                            {group.map(({ cue, index }, lineIndex) => {
                              const sourceLine = cue.sourceText === undefined ? null : (
                                <textarea
                                  className="video-subtitle-cue-source"
                                  rows={1}
                                  value={cue.sourceText}
                                  dir="auto"
                                  readOnly={editReadOnly}
                                  onFocus={() => setSelectedCueId(cue.id)}
                                  onChange={editReadOnly ? undefined : event => editText(cue, event.target.value, 'sourceText')}
                                  aria-label={l(
                                    `${activeSubtitleLabel}原文 ${index + 1}`,
                                    `${activeSubtitleLabel} source ${index + 1}`
                                  )}
                                />
                              );
                              const translationLine = (
                                <textarea
                                  className={lineIndex > 0 ? 'video-subtitle-cue-source' : 'video-subtitle-cue-translation'}
                                  rows={1}
                                  value={cue.text}
                                  dir="auto"
                                  readOnly={editReadOnly}
                                  onFocus={() => setSelectedCueId(cue.id)}
                                  onChange={editReadOnly
                                    ? undefined
                                    : event => editText(cue, event.target.value)}
                                  aria-label={props.subtitleOnly ? `${activeSubtitleLabel} ${index + 1}` : `${subtitleVariantLabel(activeSubtitleOutput.variant, l)} ${index + 1}`}
                                />
                              );
                              return (
                                <div className="video-subtitle-cue-pair" key={cue.id}>
                                  {props.immersive || activeSubtitleOutput.translationPosition === 'bottom' ? sourceLine : null}
                                  {translationLine}
                                  {!props.immersive && activeSubtitleOutput.translationPosition !== 'bottom' ? sourceLine : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="video-result-subtitle-empty" role="status">{l('字幕文件中没有可显示的内容', 'The subtitle file contains no cues')}</div>
                )}
              </section>
            </div>
          ) : (
            <div className="video-result-subtitle-empty" role="status">
              <strong>{subtitleEmptyTitle}</strong>
              {executionDetail ? <p>{executionDetail}</p> : null}
            </div>
          )}
          {props.immersive && activeSubtitleOutput ? <SubtitleTimeline
            key={`${props.version}-${activeSubtitleVariant}`}
            cues={activeSubtitleOutput.cues} src={activeSubtitleVideo?.src}
            voiceSrc={props.voiceOutput?.src}
            currentTime={subtitlePlaybackTime} duration={subtitleDuration} playing={subtitlePlaying}
            selectedId={selectedCueId} readOnly={editReadOnly || !props.onSubtitleCuesChange}
            onSelect={id => { setSelectedCueId(id); subtitleCueRefs.current.get(id)?.scrollIntoView?.({ block: 'nearest' }); }}
            onSeek={seekSubtitle} onChange={replaceCues}
            onPlaybackChange={playing => {
              const video = subtitleVideoRef.current;
              if (!video) return;
              if (playing) void video.play().catch(() => setSubtitlePlaying(false));
              else video.pause();
            }}
            onTogglePlay={() => {
              const video = subtitleVideoRef.current;
              if (!video) return;
              if (video.paused) void video.play().catch(() => setSubtitlePlaying(false));
              else video.pause();
            }}
          /> : null}
        </div>
      ) : null}

      {props.activeTab === 'voice' ? (
        <div className="video-result-pane">
          <header className="video-result-pane-heading">
            <div>
              <h2>{l('目标语言配音', 'Target-language dubbing')}</h2>
              {props.hasVoiceArtifact ? <p>{l('配音文件已生成', 'Dubbing file generated')}</p> : null}
            </div>
          </header>
          {props.hasVoiceArtifact && props.voiceOutput !== undefined ? (
            <div className="video-result-voice-output">
              <div className="video-result-audio-preview">
                {props.voiceOutput.src !== undefined ? (
                  <audio
                    controls
                    preload="metadata"
                    src={props.voiceOutput.src}
                    aria-label={l('目标语言配音试听', 'Target-language dubbing preview')}
                  />
                ) : (
                  <div className="video-result-audio-status" role="status">
                    <span>
                      {props.voiceOutput.previewLoading
                        ? l('正在加载配音...', 'Loading dubbing...')
                        : props.voiceOutput.previewError ?? l('配音试听暂时不可用，可直接下载文件。', 'Dubbing preview is unavailable. You can still download the file.')}
                    </span>
                    {!props.voiceOutput.previewLoading && props.voiceOutput.previewError !== undefined ? (
                      <button type="button" onClick={props.onReloadVoice}>
                        <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
                        {l('重新加载配音', 'Reload dubbing')}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="video-result-file-row">
                <span aria-hidden="true"><FileAudio size={19} strokeWidth={1.7} /></span>
                <div>
                  <strong>{props.voiceOutput.fileName ?? `${l('目标语言配音', 'Target-language-dubbing')}-V${props.version}.wav`}</strong>
                  <small>
                    {l('配音', 'Dubbing')} V{props.voiceOutput.artifactVersion}
                    {' · '}{l('项目', 'Project')} V{props.version}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => props.onExport('voice', props.voiceOutput?.artifactId)}
                  aria-label={l('下载配音文件', 'Download dubbing file')}
                  title={l('下载配音文件', 'Download dubbing file')}
                >
                  <Download size={16} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <div className="video-result-empty" role="status">
              <FileAudio size={26} strokeWidth={1.5} aria-hidden="true" />
              <strong>{voiceEmptyTitle}</strong>
              {props.dubbing && executionDetail ? <p>{executionDetail}</p> : null}
              {props.execution === undefined ? (
                <button type="button" onClick={props.onAdjustSettings}>{props.dubbing
                  ? l('调整配音设置', 'Adjust dubbing settings')
                  : l('开启配音并生成新版本', 'Enable dubbing and generate a new version')}</button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {props.activeTab === 'settings' ? (
        <div className="video-result-pane">
          <header className="video-result-pane-heading">
            <div>
              <h2>{l('当前版本设置', 'Current version settings')}</h2>
            </div>
            <button type="button" onClick={props.onAdjustSettings}>
              <Settings2 size={15} strokeWidth={1.8} aria-hidden="true" />
              {l('调整设置', 'Adjust settings')}
            </button>
          </header>
          <dl className="video-result-settings">
            <div><dt>{l('目标语言', 'Target language')}</dt><dd>{props.targetLanguage}</dd></div>
            {!props.subtitleOnly ? <div><dt>{l('字幕样式', 'Subtitle style')}</dt><dd>{props.subtitleStyleLabel}</dd></div> : null}
            {!props.subtitleOnly ? <div><dt>{l('配音', 'Dubbing')}</dt><dd>{props.dubbing ? l('已开启', 'Enabled') : l('未开启', 'Disabled')}</dd></div> : null}
            <div><dt>{l('输出内容', 'Output')}</dt><dd>{props.outputLabel}</dd></div>
            <div>
              <dt>{l('字幕文件', 'Subtitle files')}</dt>
              <dd>{props.subtitleOutputs.length} {l('个文件', 'files')} · {subtitleCueCount} {l('条字幕', 'subtitles')}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {(props.hasPendingChanges || props.regenerationPending) ? (
        <div
          className="video-result-regenerate"
          data-confirming={props.regenerationPending}
          role={props.regenerationPending ? 'group' : 'region'}
          aria-label={props.regenerationPending ? l('确认生成新版本', 'Confirm new version') : l('生成新版本', 'Generate new version')}
        >
          {props.regenerationPending ? (
            <>
              <span className={props.immersive ? 'subtitle-editor-regenerate-summary' : 'app-visually-hidden'}>
                {l(
                  `将更新${props.affectedArtifacts.join('、')}，V${props.version} 的全部产出会保留`,
                  `Will update ${props.affectedArtifacts.join(', ')}. All V${props.version} outputs will be preserved`
                )}
              </span>
              <div className="video-result-regenerate-actions">
                <button type="button" onClick={props.onCancelRegenerate}>{l('取消', 'Cancel')}</button>
                <button type="button" disabled={props.subtitleSavePending || props.editorSettings?.disabled} onClick={props.onConfirmRegenerate}>{l(`确认生成 V${props.nextVersion}`, `Confirm and generate V${props.nextVersion}`)}</button>
              </div>
            </>
          ) : (
            <button type="button" disabled={props.subtitleSavePending || props.editorSettings?.disabled} onClick={props.onRequestRegenerate}>
              {props.subtitleDirty ? l(`保存并生成 V${props.nextVersion}`, `Save and generate V${props.nextVersion}`) : l(`生成 V${props.nextVersion}`, `Generate V${props.nextVersion}`)}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function videoVariantFormatLabel(variant: VideoResultVariant, l: LocalizeCopy): string {
  return ({
    horizontal: l('横屏 16:9', 'Horizontal 16:9'),
    vertical: l('竖屏 9:16', 'Vertical 9:16'),
    dubbed: l('配音视频', 'Dubbed video')
  } as const)[variant];
}

function videoVariantArtifactLabel(variant: VideoResultVariant, l: LocalizeCopy): string {
  return ({
    horizontal: l('横屏成片', 'Horizontal video'),
    vertical: l('竖屏成片', 'Vertical video'),
    dubbed: l('配音视频', 'Dubbed video')
  } as const)[variant];
}

function subtitleVariantLabel(variant: SubtitleResultVariant, l: LocalizeCopy): string {
  return variant === 'horizontal'
    ? l('横屏字幕', 'Horizontal subtitles')
    : l('竖屏字幕', 'Vertical subtitles');
}

function subtitleCueDisplayText(
  cue: SubtitleCue,
  translationPosition: SubtitleResultOutput['translationPosition']
): string {
  if (cue.sourceText === undefined) return cue.text;
  return translationPosition === 'bottom'
    ? `${cue.sourceText}\n${cue.text}`
    : `${cue.text}\n${cue.sourceText}`;
}

function localizeResultTab(label: string, l: LocalizeCopy): string {
  const labels: Record<string, string> = {
    '作品': 'Outputs',
    '字幕': 'Subtitles',
    '配音': 'Dubbing',
    '任务设置': 'Task settings'
  };
  return l(label, labels[label] ?? label);
}

function emptyResultTitle(
  tab: 'video' | 'subtitles' | 'voice',
  status: VideoTranslationResultExecution['status'] | undefined,
  l: LocalizeCopy
): string {
  if (status === 'failed') return l('翻译任务失败', 'Translation failed');
  if (status === 'needs_input') return l('翻译任务等待处理', 'Translation needs your attention');
  if (status === 'canceled') return l('翻译任务已终止', 'Translation stopped');
  if (status === 'interrupted') return l('翻译任务已中断', 'Translation interrupted');
  if (status === 'queued') return ({
    video: l('翻译任务等待执行', 'Translation is queued'),
    subtitles: l('字幕等待生成', 'Subtitles are pending'),
    voice: l('配音等待生成', 'Dubbing is pending')
  })[tab];
  if (status === 'running') return ({
    video: l('翻译进行中', 'Translation in progress'),
    subtitles: l('字幕尚未就绪', 'Subtitles are not ready yet'),
    voice: l('配音尚未就绪', 'Dubbing is not ready yet')
  })[tab];
  return ({
    video: l('此版本暂无生成结果', 'No outputs available for this version'),
    subtitles: l('此版本尚未生成字幕', 'Subtitles have not been generated for this version'),
    voice: l('此版本尚未生成配音', 'Dubbing has not been generated for this version')
  })[tab];
}

function subtitleTimestampSeconds(value: string): number {
  return subtitleSeconds(value);
}

function subtitleCueShortTime(value: string): string {
  const match = /^(\d+):(\d{2}):(\d{2})/.exec(value.trim());
  if (match === null) return value;
  return Number(match[1]) === 0
    ? `${match[2]}:${match[3]}`
    : `${match[1]}:${match[2]}:${match[3]}`;
}

function groupSubtitleCues(cues: SubtitleCue[], variant: SubtitleResultVariant) {
  const groups: Array<Array<{ cue: SubtitleCue; index: number }>> = [];
  cues.forEach((cue, index) => {
    const previous = groups[groups.length - 1];
    const firstCue = previous?.[0]?.cue;
    const firstStart = subtitleTimestampSeconds(firstCue?.start ?? '');
    const firstEnd = subtitleTimestampSeconds(firstCue?.end ?? '');
    const start = subtitleTimestampSeconds(cue.start);
    const end = subtitleTimestampSeconds(cue.end);
    const sameTime = firstStart === start && firstEnd === end;
    if (variant === 'vertical' && previous !== undefined
      && Number.isFinite(firstStart) && Number.isFinite(firstEnd)
      && Number.isFinite(start) && Number.isFinite(end) && end > start
      && start >= firstStart && end <= firstEnd
      && (!sameTime || previous.length === 1)) {
      previous.push({ cue, index });
    } else {
      groups.push([{ cue, index }]);
    }
  });
  return groups;
}
