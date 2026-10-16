import { Check, ChevronDown, Search } from 'lucide-react';
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { appLanguageOptions, type AppLanguagePreference } from '../../i18n/language.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import './language-select.css';

type MenuPosition = { left: number; top: number; width: number; maxHeight: number; above: boolean };
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();

export default function LanguageSelect(props: {
  id: string;
  label: string;
  value: AppLanguagePreference;
  systemLabel: string;
  onChange(value: AppLanguagePreference): void;
}) {
  const { language } = useAppLanguage();
  const l = useLocalizedCopy();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition>();
  const options = useMemo(() => {
    const localizedNames = new Intl.DisplayNames([language, 'en'], { type: 'language' });
    const chineseNames = new Intl.DisplayNames(['zh-CN'], { type: 'language' });
    return [
      { value: 'system' as const, label: props.systemLabel, englishName: 'System', group: '',
        search: normalize(`${props.systemLabel} System 跟随系统 跟隨系統`) },
      ...appLanguageOptions.map(option => ({ ...option, group: option.englishName[0]!,
        search: normalize([option.label, option.englishName, option.value,
          localizedNames.of(option.value), chineseNames.of(option.value)].join(' ')) }))
    ];
  }, [language, props.systemLabel]);
  const filtered = useMemo(() => {
    const term = normalize(query);
    if (!term) return options;
    // A single Latin letter jumps to the corresponding English-name section.
    if (/^[a-z]$/.test(term)) return options.filter(option => option.value !== 'system' && normalize(option.englishName).startsWith(term));
    const codeMatches = options.filter(option => option.value.toLowerCase() === term || option.value.split('-')[0] === term);
    if (codeMatches.length) return codeMatches;
    return options.filter(option => term.split(/\s+/).every(word => option.search.includes(word)));
  }, [options, query]);
  const selected = options.find(option => option.value === props.value)!;
  const displayName = selected.label === selected.englishName || selected.value === 'system'
    ? selected.label : `${selected.label} · ${selected.englishName}`;
  const currentIndex = Math.min(activeIndex, filtered.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  function close() { setOpen(false); setQuery(''); }
  function show() {
    if (open) return;
    setQuery('');
    setActiveIndex(Math.max(0, options.findIndex(option => option.value === props.value)));
    setOpen(true);
  }
  function select(value: AppLanguagePreference) {
    inputRef.current?.focus();
    close();
    if (value !== props.value) props.onChange(value);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('blur', close);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('blur', close); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = Math.min(Math.max(rect.width, 320), (viewport?.width ?? innerWidth) - 16);
      const below = y + (viewport?.height ?? innerHeight) - rect.bottom - 14;
      const above = rect.top - y - 14;
      const opensAbove = below < 240 && above > below;
      const start = getComputedStyle(rootRef.current!).direction === 'rtl' ? rect.left : rect.right - width;
      setPosition({ left: Math.max(x + 8, Math.min(start, x + (viewport?.width ?? innerWidth) - width - 8)),
        top: opensAbove ? rect.top - 6 : rect.bottom + 6, width,
        maxHeight: Math.max(0, Math.min(360, opensAbove ? above : below)), above: opensAbove });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open]);

  useEffect(() => {
    if (open && currentIndex >= 0) document.getElementById(optionId(currentIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [open, currentIndex, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (!open && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); setQuery(event.key); setActiveIndex(0); setOpen(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      if (filtered.length) setActiveIndex((currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
    } else if ((event.key === 'Home' || event.key === 'End') && open && !query) {
      event.preventDefault(); setActiveIndex(event.key === 'Home' ? 0 : filtered.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!open) show();
      else if (filtered[currentIndex]) select(filtered[currentIndex].value);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Tab') close();
  }

  return <div className="language-select" ref={rootRef}>
    <div className="language-select-control">
      {open ? <Search className="language-select-search-icon" size={15} aria-hidden="true" /> : null}
      <input id={props.id} ref={inputRef} role="combobox" type="text" aria-label={props.label}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && currentIndex >= 0 ? optionId(currentIndex) : undefined}
        autoComplete="off" spellCheck={false} data-value={props.value}
        className={open ? 'is-open' : undefined} value={open ? query : displayName}
        placeholder={l('搜索语言', 'Search languages')} title={open ? undefined : displayName}
        onFocus={show} onClick={show} onKeyDown={onKeyDown}
        onCompositionStart={() => { if (!open) { setQuery(''); setActiveIndex(0); setOpen(true); } }}
        onBlur={event => { if (!rootRef.current?.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) close(); }}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} />
      <button type="button" tabIndex={-1} aria-label={props.label} aria-expanded={open}
        onMouseDown={event => event.preventDefault()} onClick={() => { inputRef.current?.focus(); if (open) close(); else show(); }}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
    {open && position ? createPortal(<div ref={menuRef} className="language-select-menu" style={{
      left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight,
      transform: position.above ? 'translateY(-100%)' : undefined
    }}>
      <div id={listId} role="listbox" aria-label={props.label}>
        {filtered.map((option, index) => <Fragment key={option.value}>
          {option.group && option.group !== filtered[index - 1]?.group ? <div className="language-select-letter" aria-hidden="true">{option.group}</div> : null}
          <div id={optionId(index)} role="option" aria-selected={props.value === option.value}
            data-value={option.value} className={`language-select-option${index === currentIndex ? ' is-active' : ''}`}
            onMouseDown={event => event.preventDefault()}
            onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(index); }} onClick={() => select(option.value)}>
            <span><bdi lang={option.value === 'system' ? undefined : option.value}>{option.label}</bdi>{option.value !== 'system' && option.label !== option.englishName ? <small lang="en" dir="ltr">{option.englishName}</small> : null}</span>
            {props.value === option.value ? <Check size={16} aria-hidden="true" /> : null}
          </div>
        </Fragment>)}
      </div>
      {!filtered.length ? <div className="language-select-empty" role="status">{l('没有匹配的语言', 'No matching languages')}</div> : null}
    </div>, document.body) : null}
  </div>;
}
