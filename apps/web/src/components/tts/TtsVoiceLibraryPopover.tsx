import { AudioLines, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function TtsVoiceLibraryPopover(props: {
  label: string;
  name: string;
  detail?: string;
  disabled?: boolean;
  resetKey: string;
  onClose(): void;
  children(close: () => void): ReactNode;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean }>();
  const expanded = open && !props.disabled;
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    onCloseRef.current();
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => { close(); }, [props.disabled, props.resetKey, close]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const anchorTop = Math.max(top + 12, Math.min(rect.top, bottom - 12));
      const anchorBottom = Math.max(top + 12, Math.min(rect.bottom, bottom - 12));
      const below = bottom - anchorBottom - 16;
      const above = anchorTop - top - 16;
      const opensAbove = below < 520 && above > below;
      const panelWidth = Math.min(600, width - 24);
      const panelLeft = getComputedStyle(trigger).direction === 'rtl' ? rect.left : rect.right - panelWidth;
      const next = {
        left: Math.max(left + 12, Math.min(panelLeft, left + width - panelWidth - 12)),
        top: opensAbove ? anchorTop - 8 : anchorBottom + 8,
        width: panelWidth,
        maxHeight: Math.max(0, Math.min(620, opensAbove ? above : below)),
        above: opensAbove
      };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const blur = () => close();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('blur', blur);
    };
  }, [expanded, close]);

  const positioned = expanded && !!position;
  useEffect(() => {
    if (positioned) {
      const target = panelRef.current?.querySelector<HTMLElement>('input[type="search"]:not(:disabled)')
        ?? panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
      target?.focus({ preventScroll: true });
    }
  }, [positioned]);

  return <>
    <div className="tts-voice-library-entry">
      <span id={`${id}-label`}>{props.label}</span>
      <button ref={triggerRef} type="button" className="tts-voice-library-trigger" disabled={props.disabled}
        aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={expanded}
        aria-controls={expanded ? id : undefined} onClick={() => { if (expanded) close(); else setOpen(true); }}>
        <AudioLines size={20} aria-hidden="true" />
        <span><strong id={`${id}-value`}><bdi>{props.name || '—'}</bdi></strong>{props.detail ? <small>{props.detail}</small> : null}</span>
        <ChevronRight className="tts-voice-library-chevron" size={17} aria-hidden="true" />
      </button>
    </div>
    {expanded && position ? createPortal(<div id={id} ref={panelRef} className="tts-voice-library-popover" role="dialog" aria-label={props.label}
      style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, transform: position.above ? 'translateY(-100%)' : undefined }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') {
          const elements = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select, a[href], [tabindex]')].filter(element => element.tabIndex >= 0 && !element.matches(':disabled'));
          if ((event.shiftKey && event.target === elements[0]) || (!event.shiftKey && event.target === elements.at(-1))) {
            event.preventDefault(); close(true);
          }
        }
      }}>
      {props.children(() => close(true))}
    </div>, document.body) : null}
  </>;
}
