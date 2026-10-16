import type {
  CreatorTtsProvider,
  CreatorTtsVoice
} from '@opencreator/protocol';
import {
  LoaderCircle,
  Pause,
  Play,
  RefreshCw
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IssueList } from '../../features/issues/IssuePresenter.js';
import { usePageIssueState } from '../../features/issues/page-issue-state.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { CreatorServicesSettingsService } from '../../services/creator-services-service.js';
import { TtsVoiceSelect, type TtsVoiceSelectGroup } from './TtsVoiceSelect.js';
import { TtsVoiceLibrary, type VoiceLibraryOption } from './TtsVoiceLibrary.js';
import { voiceScenarioLabel } from './voice-scenario-copy.js';
import './tts-voice-picker.css';

export function TtsVoicePicker(props: {
  id: string;
  provider: CreatorTtsProvider;
  model: string;
  value: string;
  service: Pick<CreatorServicesSettingsService, 'getTtsVoices' | 'previewTtsVoice'> | null;
  label?: string;
  presentation?: 'select' | 'library';
  disabled?: boolean;
  allowCustomVoice?: boolean;
  onChange(voiceId: string, voice?: CreatorTtsVoice): void;
  onVoiceResolved?(voice: CreatorTtsVoice): void;
}) {
  const l = useLocalizedCopy();
  const { language: appLanguage } = useAppLanguage();
  const allowCustomVoice = props.allowCustomVoice ?? props.provider === 'volcengine';
  const pageIssues = usePageIssueState('tts-voice');
  const [voices, setVoices] = useState<CreatorTtsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewVoiceId, setPreviewVoiceId] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [customId, setCustomId] = useState(props.value);
  const audioRef = useRef<HTMLAudioElement>(null);
  const previewUrlRef = useRef('');
  const previewRequestRef = useRef(0);
  const onVoiceResolvedRef = useRef(props.onVoiceResolved);
  onVoiceResolvedRef.current = props.onVoiceResolved;

  useEffect(() => {
    let active = true;
    if (props.service === null || props.provider === 'edge-tts') {
      setVoices([]);
      setLoading(false);
      pageIssues.resolveOperation('tts.load-voices');
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void props.service.getTtsVoices(props.provider, props.model)
      .then(response => {
        if (!active) return;
        setVoices(response.voices);
        pageIssues.resolveOperation('tts.load-voices');
      })
      .catch(cause => {
        if (active) {
          setVoices([]);
          pageIssues.captureOperationFailure(
            'tts.load-voices',
            cause,
            l('无法加载音色列表，请检查服务配置和网络后重试。', 'Could not load voices. Check the service settings and network, then retry.'),
            { retryable: true }
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    l,
    pageIssues.captureOperationFailure,
    pageIssues.resolveOperation,
    props.model,
    props.provider,
    props.service,
    reloadToken
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      previewRequestRef.current += 1;
      if (audio?.getAttribute('src')) audio.pause();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    setCustomId(props.value);
  }, [props.value]);

  const options = useMemo(() => {
    if (!props.value || voices.some(voice => voice.id === props.value)) return voices;
    return [{
      id: props.value,
      name: props.value,
      provider: props.provider,
      kind: 'custom' as const
    }, ...voices];
  }, [props.provider, props.value, voices]);
  const selectGroups = useMemo<TtsVoiceSelectGroup[]>(() => groupVoices(options).map(group => ({
    label: group.label ? voiceScenarioLabel(group.label, l) : '',
    options: group.voices.map(voice => ({
      value: voice.id,
      name: voiceName(voice, l),
      detail: voiceDetail(voice, l, appLanguage, group.label)
    }))
  })), [appLanguage, l, options]);
  const selected = options.find(voice => voice.id === props.value);
  const libraryOptions = useMemo<VoiceLibraryOption[]>(() => options.map(voice => ({
    id: voice.id,
    name: voice.name,
    language: voiceLanguageLabel(voice.language, appLanguage, l) ?? '',
    gender: voiceGenderLabel(voice.gender, l),
    scenario: voice.scenario ? voiceScenarioLabel(voice.scenario, l) : '',
    kind: voiceKindLabel(voice.kind, l),
    custom: voice.kind === 'custom',
    recommended: voice.recommended === true,
    search: [voice.id, voice.name, voice.language, voice.gender, voice.scenario,
      voiceLanguageLabel(voice.language, appLanguage, l), voiceGenderLabel(voice.gender, l),
      voice.scenario ? voiceScenarioLabel(voice.scenario, l) : '', voiceKindLabel(voice.kind, l)].join(' ')
  })), [appLanguage, l, options]);

  useEffect(() => {
    if (selected) onVoiceResolvedRef.current?.(selected);
  }, [selected]);

  const stopPreview = useCallback(() => {
    previewRequestRef.current += 1;
    if (audioRef.current?.getAttribute('src')) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPlaying(false);
    setPreviewing(false);
    setPreviewVoiceId('');
  }, []);

  useEffect(() => { stopPreview(); }, [props.provider, props.model, props.value, props.disabled, props.service, appLanguage, stopPreview]);

  function selectVoice(voiceId: string) {
    stopPreview();
    const voice = options.find(candidate => candidate.id === voiceId);
    setCustomId(voiceId);
    if (voiceId !== props.value) props.onChange(voiceId, voice);
  }

  function commitCustomVoice(raw: string) {
    const voiceId = raw.trim();
    setCustomId(voiceId);
    if (voiceId === props.value) return;
    stopPreview();
    const voice = options.find(candidate => candidate.id === voiceId);
    props.onChange(voiceId, voice ?? {
      id: voiceId,
      name: voiceId,
      provider: props.provider,
      kind: 'custom'
    });
  }

  async function preview(voiceId = props.value) {
    if (previewVoiceId === voiceId && (playing || previewing)) {
      stopPreview();
      return;
    }
    if (
      props.service === null
      || props.provider === 'edge-tts'
      || !voiceId
      || props.disabled
      || loading
    ) return;
    stopPreview();
    const request = ++previewRequestRef.current;
    setPreviewVoiceId(voiceId);
    setPreviewing(true);
    try {
      const response = await props.service.previewTtsVoice({
        provider: props.provider,
        model: props.model,
        voiceId
      });
      if (!response.ok) throw new Error(`Voice preview request failed: ${response.status}`);
      const blob = await response.blob();
      if (request !== previewRequestRef.current) return;
      const url = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = url;
      await audio.play();
      if (request !== previewRequestRef.current) return;
      setPlaying(true);
      pageIssues.resolveOperation('tts.preview-voice');
    } catch (cause) {
      if (request !== previewRequestRef.current) return;
      pageIssues.captureOperationFailure(
        'tts.preview-voice',
        cause,
        l('音色试听失败，请检查 API Key 和网络后重试。', 'Voice preview failed. Check the API key and network, then retry.'),
        { retryable: true }
      );
    } finally {
      if (request === previewRequestRef.current) setPreviewing(false);
    }
  }

  return (
    <div className={`tts-voice-picker${props.presentation === 'library' ? ' is-library' : ''}`}>
      {props.presentation === 'library' ? <TtsVoiceLibrary
        key={`${props.provider}:${props.model}:${appLanguage}`}
        id={props.id}
        label={props.label ?? l('默认音色', 'Default voice')}
        value={props.value}
        options={libraryOptions}
        loading={loading}
        disabled={props.disabled || props.provider === 'edge-tts'}
        canRefresh={props.service !== null && props.provider !== 'edge-tts'}
        canPreview={props.service !== null && props.provider !== 'edge-tts'}
        previewVoiceId={previewVoiceId}
        previewing={previewing}
        playing={playing}
        onRefresh={() => { stopPreview(); setReloadToken(current => current + 1); }}
        onPreview={voiceId => void preview(voiceId)}
        onStopPreview={stopPreview}
        onChange={selectVoice}
      /> : <>
        <div className="tts-voice-picker-field">
          <span id={`${props.id}-label`}>{props.label ?? l('默认音色', 'Default voice')}</span>
          <TtsVoiceSelect
            id={props.id}
            labelId={`${props.id}-label`}
            value={props.value}
            groups={selectGroups}
            placeholder={loading
              ? l('正在加载音色', 'Loading voices')
              : allowCustomVoice
                ? l('请填写下方 Speaker ID', 'Enter a speaker ID below')
                : l('暂无可用音色', 'No voices available')}
            disabled={props.disabled || loading || props.provider === 'edge-tts'}
            onChange={selectVoice}
          />
        </div>
        <div className="tts-voice-picker-actions">
          <button
            type="button"
            disabled={props.disabled || loading || props.service === null || props.provider === 'edge-tts'}
            aria-label={l('刷新音色列表', 'Refresh voices')}
            title={l('刷新音色列表', 'Refresh voices')}
            onClick={() => { stopPreview(); setReloadToken(current => current + 1); }}
          >
            {loading
              ? <LoaderCircle className="tts-voice-picker-spinner" size={16} aria-hidden="true" />
              : <RefreshCw size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            disabled={props.disabled || !selected || props.service === null || props.provider === 'edge-tts' || previewing}
            aria-label={playing ? l('暂停音色试听', 'Pause voice preview') : l('试听当前音色', 'Preview selected voice')}
            title={playing ? l('暂停', 'Pause') : l('试听', 'Preview')}
            onClick={() => void preview()}
          >
            {previewing
              ? <LoaderCircle className="tts-voice-picker-spinner" size={16} aria-hidden="true" />
              : playing
                ? <Pause size={16} aria-hidden="true" />
                : <Play size={16} aria-hidden="true" />}
          </button>
        </div>
      </>}
      <audio ref={audioRef} hidden onEnded={stopPreview} />
      {allowCustomVoice ? (
        <label className="tts-voice-picker-custom" htmlFor={`${props.id}-custom`}>
          <span>{l('克隆 / 自定义 Speaker ID', 'Clone / custom speaker ID')}</span>
          <input
            id={`${props.id}-custom`}
            type="text"
            value={customId}
            placeholder={l('例如 S_xxxxxxxx 或官方音色 ID', 'e.g. S_xxxxxxxx or an official voice ID')}
            spellCheck={false}
            autoComplete="off"
            disabled={props.disabled || props.provider === 'edge-tts'}
            onChange={event => setCustomId(event.target.value)}
            onBlur={() => commitCustomVoice(customId)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitCustomVoice(customId);
              }
            }}
          />
        </label>
      ) : null}
      {!selected && allowCustomVoice && !loading ? (
        <small className="tts-voice-picker-meta">
          {l(
            '声音复刻请填写控制台中的 Speaker ID（S_ 开头）。',
            'For cloned voices, enter the console Speaker ID starting with S_.'
          )}
        </small>
      ) : null}
      <IssueList
        issues={pageIssues.issues}
        actions={{
          retryOperations: {
            'tts.load-voices': () => setReloadToken(current => current + 1),
            'tts.preview-voice': () => preview(previewVoiceId || props.value)
          }
        }}
        onDismiss={pageIssues.dismissIssue}
        compact
      />
    </div>
  );
}

function voiceName(voice: CreatorTtsVoice, l: (zh: string, en: string) => string): string {
  const name = voice.name === voice.id ? voice.name : `${voice.name} (${voice.id})`;
  return voice.recommended ? `${name} · ${l('推荐', 'Recommended')}` : name;
}

function voiceDetail(
  voice: CreatorTtsVoice,
  l: (zh: string, en: string) => string,
  appLanguage: string,
  groupLabel: string
): string | undefined {
  // The group header already shows the scenario, so only repeat it for ungrouped voices.
  const details = [
    voice.scenario && voice.scenario !== groupLabel ? voiceScenarioLabel(voice.scenario, l) : undefined,
    voiceLanguageLabel(voice.language, appLanguage, l),
    voiceKindLabel(voice.kind, l)
  ].filter(Boolean);
  return details.length > 0 ? details.join(' · ') : undefined;
}

function voiceLanguageLabel(
  code: string | undefined,
  appLanguage: string,
  l: (zh: string, en: string) => string
): string | undefined {
  if (!code) return undefined;
  if (code === 'multi') return l('多语种', 'Multilingual');
  const dialect = chineseDialects[code];
  if (dialect !== undefined) return l(dialect[0], dialect[1]);
  // Catalogs mix BCP 47 codes with free-form labels; anything Intl rejects is shown as-is.
  try {
    const names = new Intl.DisplayNames([appLanguage], { type: 'language', fallback: 'none' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

const chineseDialects: Readonly<Record<string, readonly [string, string]>> = {
  'zh-yue': ['粤语', 'Cantonese'],
  'zh-minnan': ['闽南语', 'Hokkien'],
  'zh-sichuan': ['四川话', 'Sichuanese'],
  'zh-dongbei': ['东北话', 'Northeastern Mandarin'],
  'zh-beijing': ['北京话', 'Beijing dialect'],
  'zh-tianjin': ['天津话', 'Tianjin dialect'],
  'zh-shanghai': ['上海话', 'Shanghainese'],
  'zh-nanjing': ['南京话', 'Nanjing dialect'],
  'zh-shaanxi': ['陕西话', 'Shaanxi dialect'],
  'zh-xian': ['西安话', "Xi'an dialect"],
  'zh-hunan': ['湖南话', 'Hunanese'],
  'zh-guangxi': ['广西话', 'Guangxi dialect'],
  'zh-zhengzhou': ['郑州话', 'Zhengzhou dialect']
};

function voiceKindLabel(
  kind: CreatorTtsVoice['kind'],
  l: (zh: string, en: string) => string
): string {
  if (kind === 'custom') return l('自定义音色', 'Custom');
  if (kind === 'designed') return l('设计音色', 'Designed');
  return '';
}

function voiceGenderLabel(gender: string | undefined, l: (zh: string, en: string) => string): string {
  if (!gender) return '';
  if (/^(?:male|男|男性|男声)$/i.test(gender)) return l('男声', 'Male');
  if (/^(?:female|女|女性|女声)$/i.test(gender)) return l('女声', 'Female');
  if (/^(?:neutral|中性)$/i.test(gender)) return l('中性', 'Neutral');
  return gender;
}

function groupVoices(voices: CreatorTtsVoice[]): Array<{
  label: string;
  voices: CreatorTtsVoice[];
}> {
  const groups: Array<{ label: string; voices: CreatorTtsVoice[] }> = [];
  const index = new Map<string, number>();
  for (const voice of voices) {
    const label = voice.kind === 'custom' ? '' : (voice.scenario ?? '');
    const existing = index.get(label);
    if (existing === undefined) {
      index.set(label, groups.length);
      groups.push({ label, voices: [voice] });
      continue;
    }
    groups[existing]!.voices.push(voice);
  }
  return groups;
}
