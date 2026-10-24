import AppSelect from '../../components/forms/Select.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, X } from 'lucide-react';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type { SubtitleCue } from './VideoTranslationResultWorkspace.js';
import { findSubtitleMatches, replaceSubtitleMatches, type SubtitleMatch, type SubtitleSearchScope } from './subtitle-search.js';

export default function SubtitleFindReplace(props: {
  cues: SubtitleCue[]; readOnly: boolean;
  onChange(cues: SubtitleCue[]): void;
  onLocate(match: SubtitleMatch | undefined): void;
  onClose(): void;
}) {
  const l = useLocalizedCopy();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [scope, setScope] = useState<SubtitleSearchScope>(() => props.cues.some(cue => cue.sourceText !== undefined) ? 'all' : 'text');
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const locateRef = useRef(props.onLocate);
  locateRef.current = props.onLocate;
  const matches = useMemo(() => findSubtitleMatches(props.cues, query, scope, matchCase), [props.cues, query, scope, matchCase]);
  const currentIndex = Math.min(index, Math.max(0, matches.length - 1));
  const match = matches[currentIndex];
  const text = match ? props.cues[match.cueIndex]![match.field]! : '';
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { locateRef.current(match); }, [match?.cueId, match?.field, match?.start, match?.end]);
  const navigate = (delta: number) => { if (matches.length) setIndex((currentIndex + delta + matches.length) % matches.length); };

  function replace(all: boolean) {
    if (!match || props.readOnly) return;
    const cues = replaceSubtitleMatches(props.cues, all ? matches : [match], replacement);
    const remaining = findSubtitleMatches(cues, query, scope, matchCase);
    const next = remaining.findIndex(item => item.cueIndex > match.cueIndex || (item.cueIndex === match.cueIndex
      && (item.field !== match.field ? item.field === 'text' : item.start >= match.start + replacement.length)));
    setIndex(all || next < 0 ? 0 : next);
    props.onChange(cues);
  }

  return <section className="subtitle-editor-find" role="search" aria-label={l('查找与替换', 'Find and replace')}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.onClose(); }
      if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        if (event.target === inputRef.current) navigate(event.shiftKey ? -1 : 1);
        else replace(false);
      }
    }}>
    <header>
      <strong>{l('查找与替换', 'Find and replace')}</strong>
      <AppSelect aria-label={l('搜索范围', 'Search scope')} value={scope} onChange={event => { setScope(event.target.value as SubtitleSearchScope); setIndex(0); }}>
        <option value="text">{l('译文', 'Translation')}</option>
        {props.cues.some(cue => cue.sourceText !== undefined) ? <>
          <option value="sourceText">{l('原文', 'Original text')}</option>
          <option value="all">{l('全部', 'All')}</option>
        </> : null}
      </AppSelect>
      <button type="button" aria-label={l('关闭', 'Close')} onClick={props.onClose}><X size={16} /></button>
    </header>
    <div className="subtitle-editor-find-row">
      <input ref={inputRef} aria-label={l('查找', 'Find')} placeholder={l('查找', 'Find')} value={query} dir="auto"
        onChange={event => { setQuery(event.target.value); setIndex(0); }} />
      <button type="button" aria-label={l('区分大小写', 'Match case')} title={l('区分大小写', 'Match case')}
        aria-pressed={matchCase} onClick={() => { setMatchCase(value => !value); setIndex(0); }}><CaseSensitive size={18} /></button>
      <button type="button" aria-label={l('上一处', 'Previous match')} title={l('上一处', 'Previous match')} disabled={!matches.length} onClick={() => navigate(-1)}><ArrowUp size={16} /></button>
      <button type="button" aria-label={l('下一处', 'Next match')} title={l('下一处', 'Next match')} disabled={!matches.length} onClick={() => navigate(1)}><ArrowDown size={16} /></button>
    </div>
    <div className="subtitle-editor-find-row" data-replacement="true">
      <input aria-label={l('替换为', 'Replace with')} placeholder={l('替换为', 'Replace with')} value={replacement} dir="auto"
        disabled={props.readOnly} onChange={event => setReplacement(event.target.value)} />
      <button type="button" disabled={props.readOnly || !matches.length} onClick={() => replace(false)}>{l('替换', 'Replace')}</button>
      <button type="button" disabled={props.readOnly || !matches.length} onClick={() => replace(true)}>{l('全部替换', 'Replace all')}</button>
    </div>
    <div className="subtitle-editor-find-status" role="status">
      <span>{matches.length ? `${currentIndex + 1} / ${matches.length}` : query ? l('无匹配结果', 'No matches') : '0 / 0'}</span>
      {match ? <span className="subtitle-editor-find-excerpt" dir="auto" title={text}>
        {text.slice(Math.max(0, match.start - 24), match.start)}<mark>{text.slice(match.start, match.end)}</mark>{text.slice(match.end, match.end + 60)}
      </span> : null}
    </div>
  </section>;
}
