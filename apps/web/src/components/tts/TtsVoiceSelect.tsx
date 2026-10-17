import { Check, ChevronDown } from 'lucide-react';
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type TtsVoiceSelectOption = { value: string; name: string; detail?: string };
export type TtsVoiceSelectGroup = { label: string; options: TtsVoiceSelectOption[] };

type MenuPosition = { left: number; top: number; width: number; maxHeight: number; above: boolean };

// Native <select> menus cannot show a second line per option or choose their direction,
// so voices use a small listbox that opens upward by default.
export function TtsVoiceSelect(props: {
  id: string;
  labelId: string;
  value: string;
  groups: TtsVoiceSelectGroup[];
  placeholder: string;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition>();
  const flat = props.groups.flatMap(group => group.options);
  // Match native <select>: an unmatched value displays (and reports) the first option.
  const matchedIndex = flat.findIndex(option => option.value === props.value);
  const selectedIndex = matchedIndex >= 0 ? matchedIndex : (flat.length > 0 ? 0 : -1);
  const selected = flat[selectedIndex];
  const effectiveValue = selected?.value ?? props.value;
  const expanded = open && !props.disabled && flat.length > 0;
  const currentIndex = Math.min(Math.max(activeIndex, 0), flat.length - 1);
  const optionId = (index: number) => `${listId}-option-${index}`;

  function show() {
    if (props.disabled || flat.length === 0) return;
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }
  function select(value: string) {
    close();
    triggerRef.current?.focus();
    if (value !== props.value) props.onChange(value);
  }

  useEffect(() => { if (props.disabled) close(); }, [props.disabled]);

  useEffect(() => {
    if (!expanded) return;
    const onOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onOutsidePointer);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer);
      window.removeEventListener('blur', close);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const spaceAbove = rect.top - viewportTop - 12;
      const spaceBelow = viewportBottom - rect.bottom - 12;
      // Prefer opening upward; only flip down when there is clearly more room below.
      const above = spaceAbove >= 220 || spaceAbove >= spaceBelow;
      const width = Math.min(Math.max(rect.width, 280), viewportWidth - 16);
      const next: MenuPosition = {
        width,
        left: Math.max(viewportLeft + 8, Math.min(rect.left, viewportLeft + viewportWidth - width - 8)),
        top: above ? rect.top - 6 : rect.bottom + 6,
        maxHeight: Math.max(0, Math.min(360, above ? spaceAbove : spaceBelow)),
        above
      };
      setPosition(previous => previous
        && previous.left === next.left && previous.top === next.top && previous.width === next.width
        && previous.maxHeight === next.maxHeight && previous.above === next.above ? previous : next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded) document.getElementById(optionId(currentIndex))?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, currentIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!expanded) { show(); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((currentIndex + step + flat.length) % flat.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      if (!expanded) return;
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : flat.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!expanded) show();
      else if (flat[currentIndex]) select(flat[currentIndex].value);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    }
  }

  let index = -1;
  return (
    <>
      <button
        ref={triggerRef}
        id={props.id}
        type="button"
        role="combobox"
        className="tts-voice-select"
        aria-labelledby={props.labelId}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded ? optionId(currentIndex) : undefined}
        data-value={effectiveValue}
        disabled={props.disabled}
        onClick={() => (expanded ? close() : show())}
        onKeyDown={onKeyDown}
      >
        <span className="tts-voice-select-text">
          <span>{selected?.name ?? props.placeholder}</span>
          {selected?.detail ? <small>{selected.detail}</small> : null}
        </span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {expanded && position ? createPortal(
        <div
          ref={menuRef}
          className="tts-voice-menu"
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            maxHeight: position.maxHeight,
            transform: position.above ? 'translateY(-100%)' : undefined
          }}
        >
          <div id={listId} role="listbox" aria-labelledby={props.labelId}>
            {props.groups.map(group => {
              const items = group.options.map(option => {
                index += 1;
                const optionIndex = index;
                const isSelected = option.value === effectiveValue;
                return (
                  <div
                    key={option.value}
                    id={optionId(optionIndex)}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={option.detail ? `${option.name} · ${option.detail}` : option.name}
                    className={`tts-voice-option${optionIndex === currentIndex ? ' is-active' : ''}`}
                    onMouseDown={event => event.preventDefault()}
                    onPointerMove={event => { if (event.pointerType === 'mouse') setActiveIndex(optionIndex); }}
                    onClick={() => select(option.value)}
                  >
                    <span className="tts-voice-option-text">
                      <span>{option.name}</span>
                      {option.detail ? <small>{option.detail}</small> : null}
                    </span>
                    {isSelected ? <Check size={15} aria-hidden="true" /> : <span className="tts-voice-option-check" />}
                  </div>
                );
              });
              if (!group.label) return <Fragment key="ungrouped">{items}</Fragment>;
              return (
                <div key={group.label} role="group" aria-label={group.label}>
                  <div className="tts-voice-menu-group" aria-hidden="true">{group.label}</div>
                  {items}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
