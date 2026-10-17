import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import Fuse from 'fuse.js';
import { gatewayModelReady, gatewayRecommendedModelId, type GatewayModel } from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { officialModelPrice, officialModelPriceDescription } from './official-model-pricing.js';
import ModelBrandIcon, { modelBrand } from '../brand/ModelBrandIcon.js';
import './official-model-select.css';

export { officialModelPrice } from './official-model-pricing.js';

export function officialModelLabel(model: GatewayModel, automatic: string): string {
  if (/openrouter/i.test(model.id)) return automatic;
  return (model.name || model.id.split('/').pop() || model.id).replace(/OpenRouter\s*:?\s*/gi, '').trim();
}
export default function OfficialModelSelect(props: {
  label: string; describedBy?: string; models: GatewayModel[]; value: string;
  recommendedModel?: GatewayModel; followsRecommendation?: boolean;
  disabled?: boolean; onChange(value: string): void;
}) {
  const l = useLocalizedCopy();
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean }>();
  const automatic = l('自动选择', 'Automatic');
  const selectionValue = props.recommendedModel && (props.followsRecommendation || props.value === props.recommendedModel.id) ? gatewayRecommendedModelId : props.value;
  const choices = useMemo(() => {
    const models = [...new Map(props.models.map(model => [model.id, model])).values()];
    return [...(props.recommendedModel ? [props.recommendedModel] : []), ...models.filter(model => model.id !== props.recommendedModel?.id)].map(model => {
      const recommended = model.id === props.recommendedModel?.id;
      const name = officialModelLabel(model, automatic);
      const label = recommended ? l(`系统推荐 · ${name}`, `Recommended · ${name}`) : name;
      return { model, value: recommended ? gatewayRecommendedModelId : model.id, label, nameSearch: normalizeSearch(label), idSearch: normalizeSearch(model.id) };
    });
  }, [props.models, props.recommendedModel, automatic, l]);
  const search = useMemo(() => new Fuse(choices, {
    keys: [{ name: 'nameSearch', weight: 0.7 }, { name: 'idSearch', weight: 0.3 }],
    threshold: 0.3, ignoreLocation: true,
  }), [choices]);
  const filtered = useMemo(() => {
    if (!query.trim()) {
      return [...choices].sort((a,b)=>Number(b.value===selectionValue)-Number(a.value===selectionValue)
        || Number(b.value===gatewayRecommendedModelId || !!b.model.recommended)-Number(a.value===gatewayRecommendedModelId || !!a.model.recommended)
        || (a.model.vendor??'').localeCompare(b.model.vendor??''));
    }
    const terms = query.trim().split(/\s+/).map(normalizeSearch).filter(Boolean);
    if (terms.length === 0) return [];
    const results = search.search({
      $and: terms.map(term => ({ $or: ['nameSearch', 'idSearch'].map(key => ({ [key]: term })) })),
    }).map(result => result.item);
    const exact = new Set(choices.filter(choice => terms.every(term => choice.nameSearch.includes(term) || choice.idSearch.includes(term))));
    return exact.size ? results.filter(choice => exact.has(choice)) : results;
  }, [choices, search, query, selectionValue]);
  const selected = choices.find(choice => choice.value === selectionValue);
  const selectedLabel = selected?.label ?? (props.value || (props.models.length === 0 ? l('暂不可用', 'Unavailable') : l('选择模型', 'Select model')));
  const expanded = open && !props.disabled;
  const currentIndex = Math.min(activeIndex, filtered.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  function close() { setOpen(false); setQuery(''); setActiveIndex(0); }
  function show() {
    if (props.disabled || open) return;
    setQuery(''); setActiveIndex(0); setOpen(true);
  }
  function select(value: string) {
    if (!(value === gatewayRecommendedModelId && props.recommendedModel) && !props.models.some(model=>model.id===value&&gatewayModelReady(model)))return;
    inputRef.current?.focus();
    close();
    if (value !== selectionValue || (value === gatewayRecommendedModelId && !props.followsRecommendation)) props.onChange(value);
  }

  useEffect(() => { if (props.disabled) close(); }, [props.disabled]);
  useEffect(() => {
    if (!expanded) return;
    const onOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    window.addEventListener('blur', close);
    return () => { document.removeEventListener('pointerdown', onOutsidePointer); window.removeEventListener('blur', close); };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    // Keep the menu outside scrolling containers and within the visible viewport.
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const below = viewportBottom - rect.bottom - 14;
      const above = rect.top - viewportTop - 14;
      const opensAbove = below < 300 && above > below;
      const width = Math.min(Math.max(rect.width, 340), viewportWidth - 16);
      const menuLeft = getComputedStyle(rootRef.current!).direction === 'rtl' ? rect.right - width : rect.left;
      const next = {
        width, left: Math.max(viewportLeft + 8, Math.min(menuLeft, viewportLeft + viewportWidth - width - 8)),
        top: opensAbove ? rect.top - 6 : rect.bottom + 6,
        maxHeight: Math.max(0, Math.min(360, opensAbove ? above : below)), above: opensAbove,
      };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    if (rootRef.current) observer?.observe(rootRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded && currentIndex >= 0) document.getElementById(optionId(currentIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, currentIndex, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) { show(); return; }
      if (filtered.length) setActiveIndex((currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!expanded) show();
      else if (filtered[currentIndex]) select(filtered[currentIndex].value);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Tab') close();
  }

  return <span className="official-model-select" ref={rootRef}>
    <span className={`official-model-control${expanded ? ' is-open' : ''}`}>
      {expanded ? <Search size={15} className="official-model-search-icon" aria-hidden="true" />
        : <ModelBrandIcon model={selected?.model ?? { id: '' }} className="official-model-selected-icon" />}
      <input ref={inputRef} type="text" role="combobox" aria-label={props.label} aria-describedby={props.describedBy}
        aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded}
        aria-controls={expanded ? `${id}-listbox` : undefined}
        aria-activedescendant={expanded && currentIndex >= 0 ? optionId(currentIndex) : undefined}
        value={expanded ? query : selectedLabel} disabled={props.disabled} autoComplete="off" spellCheck={false}
        placeholder={l('搜索模型', 'Search models', 'Sök modeller')} title={expanded ? undefined : selectedLabel}
        onFocus={show} onClick={show} onKeyDown={onKeyDown}
        onBlur={event => { if (!rootRef.current?.contains(event.relatedTarget) && !menuRef.current?.contains(event.relatedTarget)) close(); }}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }} />
      {expanded && query ? <button className="official-model-clear" type="button" tabIndex={-1}
        aria-label={l('清空模型搜索', 'Clear model search', 'Rensa modellsökning')} title={l('清空搜索', 'Clear search', 'Rensa sökning')}
        onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(''); setActiveIndex(0); inputRef.current?.focus(); }}>
        <X size={14} aria-hidden="true" />
      </button> : null}
      <button className="official-model-toggle" type="button" tabIndex={-1} disabled={props.disabled}
        aria-label={expanded ? l('收起模型列表', 'Close model list', 'Stäng modellistan') : l('展开模型列表', 'Open model list', 'Öppna modellistan')}
        title={expanded ? l('收起模型列表', 'Close model list', 'Stäng modellistan') : l('展开模型列表', 'Open model list', 'Öppna modellistan')}
        onMouseDown={event => event.preventDefault()}
        onClick={() => { inputRef.current?.focus(); if (expanded) close(); else show(); }}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </span>
    {expanded && position ? createPortal(<div ref={menuRef} className="official-model-menu" style={{
      left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight,
      transform: position.above ? 'translateY(-100%)' : undefined,
    }}>
      <div className="official-model-menu-count" role="status">
        {query.trim() ? l(`${filtered.length} 个匹配项`, `${filtered.length} matches`) : l(`${choices.length} 个模型`, `${choices.length} models`)}
      </div>
      <div id={`${id}-listbox`} className="official-model-options" role="listbox" aria-label={props.label}>
        {filtered.map((choice, index) => <Fragment key={choice.model.id}>
          {choice.value !== gatewayRecommendedModelId && choice.model.vendor && (choice.model.vendor !== filtered[index-1]?.model.vendor || filtered[index-1]?.value === gatewayRecommendedModelId) ? <div className="official-model-menu-count" role="presentation">{choice.model.vendor}</div> : null}
          <button id={optionId(index)} type="button" role="option" tabIndex={-1}
          aria-label={choice.label} aria-selected={choice.value === selectionValue}
          disabled={!gatewayModelReady(choice.model)} aria-disabled={!gatewayModelReady(choice.model)}
          className={`official-model-option${index === currentIndex ? ' is-active' : ''}`}
          title={[choice.label, officialModelPriceDescription(choice.model, l)].filter(Boolean).join('\n')} onMouseDown={event => event.preventDefault()}
          onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(index); }}
          onClick={() => select(choice.value)}>
          <ModelBrandIcon model={choice.model} />
          <span className="official-model-option-text"><span className="official-model-option-name">{choice.label}</span>
            {!/openrouter/i.test(choice.model.id) && choice.value !== gatewayRecommendedModelId ? <span className="official-model-option-id">{modelDetail(choice.model, l('秒', 'seconds', 'sekunder'))}</span> : null}
            {choice.model.price?<span className="official-model-option-id">{officialModelPrice(choice.model,l)}</span>:null}
            {choice.model.recommended && choice.value !== gatewayRecommendedModelId ?<span className="official-model-option-id">{l('推荐','Recommended')}</span>:null}
            {!gatewayModelReady(choice.model)?<span className="official-model-option-id">{l('暂不可用','Temporarily unavailable')}</span>:null}
          </span>
          {choice.value === selectionValue ? <Check size={16} aria-hidden="true" /> : <span className="official-model-check-space" />}
        </button></Fragment>)}
        {filtered.length === 0 ? <div className="official-model-empty" role="status">{l('未找到匹配模型', 'No matching models')}</div> : null}
      </div>
    </div>, document.body) : null}
  </span>;
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function modelDetail(model: GatewayModel, seconds: string): string {
  const brand = model.vendor ?? modelBrand(model)?.name;
  if (model.modality === 'video' && model.durations?.length) {
    return [brand, `${model.durations.join(' / ')} ${seconds}`, model.resolutions?.join(' / ')].filter(Boolean).join(' · ');
  }
  return [brand, model.id].filter(Boolean).join(' · ');
}
