import { Plus, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveTranslationDictionaries,
  type DictionaryAsset
} from '@opencreator/protocol';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAssetLibrary } from './asset-library-context.js';
import { AssetEditor, newAsset } from './AssetEditor.js';

export function DictionaryAssetPicker({
  value,
  targetLanguage,
  onChange,
  beforeManage,
  disabled = false
}: {
  value: DictionaryAsset[];
  targetLanguage: string;
  onChange(value: DictionaryAsset[]): void;
  beforeManage?(): void;
  disabled?: boolean;
}) {
  const library = useAssetLibrary();
  const l = useLocalizedCopy();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const titleId = `${menuId}-title`;
  const actionId = `${menuId}-action`;
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    above: boolean;
  }>();
  const expanded = open && !disabled;
  const positioned = expanded && Boolean(position);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0;
      const y = viewport?.offsetTop ?? 0;
      const width = Math.min(360, (viewport?.width ?? window.innerWidth) - 16);
      const below =
        y + (viewport?.height ?? window.innerHeight) - rect.bottom - 14;
      const above = rect.top - y - 14;
      const opensAbove = below < 240 && above > below;
      const start =
        getComputedStyle(trigger).direction === 'rtl'
          ? rect.right - width
          : rect.left;
      setPosition({
        left: Math.max(
          x + 8,
          Math.min(
            start,
            x + (viewport?.width ?? window.innerWidth) - width - 8
          )
        ),
        top: opensAbove ? rect.top - 6 : rect.bottom + 6,
        width,
        maxHeight: Math.max(0, Math.min(320, opensAbove ? above : below)),
        above: opensAbove
      });
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
    if (!expanded) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [expanded]);
  useEffect(() => {
    if (positioned)
      menuRef.current
        ?.querySelector<HTMLElement>(
          'input:not(:disabled), button:not(:disabled)'
        )
        ?.focus({ preventScroll: true });
  }, [positioned]);
  if (!library) return null;
  const items = library.assets.filter(
    (asset): asset is DictionaryAsset => asset.kind === 'dictionary'
  );
  const options = [
    ...items,
    ...value.filter((asset) => !items.some((item) => item.id === asset.id))
  ];
  const { conflicts } = resolveTranslationDictionaries(value, targetLanguage);
  return (
    <div className="asset-dictionary-select">
      <div className="asset-dictionary-label">
        <span id={titleId}>{l('翻译术语表', 'Translation Glossary')}</span>
        {value.length ? <span> · {value.length}</span> : null}
      </div>
      <div className="asset-dictionary-row">
        <button
          type="button"
          className="asset-dictionary-trigger"
          ref={triggerRef}
          disabled={disabled}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          aria-labelledby={`${actionId} ${titleId}`}
          aria-controls={expanded ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <Plus size={14} aria-hidden="true" />
          <span id={actionId}>{l('添加', 'Add')}</span>
        </button>
        {positioned && position
          ? createPortal(
              <div
                className="asset-dictionary-options"
                ref={menuRef}
                id={menuId}
                role="dialog"
                aria-label={l('翻译术语表', 'Translation Glossary')}
                style={{
                  left: position.left,
                  top: position.top,
                  width: position.width,
                  maxHeight: position.maxHeight,
                  transform: position.above ? 'translateY(-100%)' : undefined
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
              >
                {options.map((asset) => (
                  <label key={asset.id}>
                    <input
                      type="checkbox"
                      disabled={
                        disabled ||
                        library.loading ||
                        (value.length >= 20 &&
                          !value.some((item) => item.id === asset.id))
                      }
                      checked={value.some((item) => item.id === asset.id)}
                      onChange={(e) =>
                        onChange(
                          e.target.checked
                            ? [...value, structuredClone(asset)]
                            : value.filter((item) => item.id !== asset.id)
                        )
                      }
                    />
                    {value.find((item) => item.id === asset.id)?.name ??
                      asset.name}
                  </label>
                ))}
                {library.failed ? (
                  <span role="alert">
                    {l(
                      '资产操作失败，请重试。',
                      'Asset operation failed. Please retry.'
                    )}
                    <button type="button" onClick={() => void library.reload()}>
                      {l('重试', 'Retry')}
                    </button>
                  </span>
                ) : null}
                <div className="asset-dictionary-actions">
                  <button
                    type="button"
                    disabled={
                      disabled ||
                      !library.available ||
                      library.loading ||
                      value.length >= 20
                    }
                    onClick={() => {
                      setOpen(false);
                      setCreating(true);
                    }}
                  >
                    <Plus size={13} />
                    {l('新建术语表', 'New glossary')}
                  </button>
                  <a href="#/assets" onClick={beforeManage}>
                    {l('在资产中管理', 'Manage in Assets')}
                  </a>
                </div>
              </div>,
              document.body
            )
          : null}
        {value.length ? (
          <div className="asset-dictionary-chips">
            {value.map((asset) => {
              const latest = items.find((item) => item.id === asset.id);
              return (
                <span className="asset-dictionary-chip" key={asset.id}>
                  <span>{asset.name}</span>
                  {latest && latest.revision !== asset.revision ? (
                    <button
                      type="button"
                      disabled={disabled || library.loading}
                      onClick={() =>
                        onChange(
                          value.map((item) =>
                            item.id === asset.id
                              ? structuredClone(latest)
                              : item
                          )
                        )
                      }
                    >
                      {l('更新', 'Update')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={disabled || library.loading}
                    aria-label={l(`移除 ${asset.name}`, `Remove ${asset.name}`)}
                    onClick={() =>
                      onChange(value.filter((item) => item.id !== asset.id))
                    }
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="asset-dictionary-unused">
            {l('未使用术语表', 'No glossary selected')}
          </p>
        )}
      </div>
      {conflicts.length ? (
        <p className="asset-dictionary-conflict" role="status">
          {l(
            '术语冲突，优先使用先选的术语表：',
            'Conflicting terms; the first selected glossary takes priority:'
          )}{' '}
          {conflicts.join(', ')}
        </p>
      ) : null}
      {creating ? (
        <AssetEditor
          initial={newAsset('dictionary')}
          onClose={() => setCreating(false)}
          onSaved={(asset) => {
            if (asset.kind === 'dictionary') onChange([...value, asset]);
          }}
        />
      ) : null}
    </div>
  );
}
