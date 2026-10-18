import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import {
  defaultSubtitleStyleAsset,
  type PersonalAsset,
  type PersonalAssetInput
} from '@opencreator/protocol';
import type { PersonalAssetsService } from '../../services/personal-assets-service.js';
import { readJsonFromStorage } from '../../storage/browser-storage.js';

const legacyKey = 'opencreator.videoTranslation.savedSubtitleStyles';
export function readLegacySubtitleAssets() {
  const raw = readJsonFromStorage<unknown>(legacyKey);
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        !item.style ||
        typeof item.style !== 'object'
      )
        return [];
      return [
        {
          id: item.id.trim().slice(0, 160),
          name: item.name.trim().slice(0, 160),
          style: normalizeLegacyStyle(item.style)
        }
      ];
    })
    .slice(0, 100);
}
function normalizeLegacyStyle(raw: Record<string, unknown>) {
  const style = { ...defaultSubtitleStyleAsset };
  const enums = {
    subtitleFont: ['system', 'sans', 'serif', 'rounded'],
    subtitleWeight: ['regular', 'medium', 'bold'],
    subtitleSize: ['small', 'medium', 'large']
  };
  const bounds: Record<string, [number, number]> = {
    subtitleOutlineWidth: [0, 12],
    subtitleShadowOpacity: [0, 1],
    subtitleShadowOffsetX: [-20, 20],
    subtitleShadowOffsetY: [-20, 20],
    subtitleShadowBlur: [0, 30]
  };
  for (const key of Object.keys(style) as (keyof typeof style)[]) {
    const value = raw[key];
    const fallback = style[key];
    let valid: unknown = fallback;
    if (key in enums) {
      const allowed = enums[key as keyof typeof enums] as readonly string[];
      if (typeof value === 'string' && allowed.includes(value)) valid = value;
    } else if (
      typeof fallback === 'number' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      const [min, max] = bounds[key]!;
      valid = Math.min(max, Math.max(min, value));
    } else if (typeof fallback === 'boolean' && typeof value === 'boolean')
      valid = value;
    else if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
      valid = value;
    Object.assign(style, { [key]: valid });
  }
  return style;
}
function useAssetStore(service: PersonalAssetsService | null) {
  const [assets, setAssets] = useState<PersonalAsset[]>([]);
  const [loading, setLoading] = useState(service !== null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    if (!service) return;
    setLoading(true);
    try {
      const legacy = readLegacySubtitleAssets();
      let migrationFailed = false;
      const result = legacy.length
        ? await service.migrateStyles(legacy).catch(async () => {
            migrationFailed = true;
            return service.list();
          })
        : await service.list();
      setAssets(result.assets);
      setFailed(migrationFailed);
      if (legacy.length && !migrationFailed) {
        try {
          localStorage.removeItem(legacyKey);
        } catch {
          /* migration remains idempotent */
        }
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [service]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const create = useCallback(
    async (input: PersonalAssetInput) => {
      if (!service) throw new Error('Asset service unavailable');
      const asset = await service.create(input);
      setAssets((current) => [...current, asset]);
      return asset;
    },
    [service]
  );
  const update = useCallback(
    async (asset: PersonalAsset, input: PersonalAssetInput) => {
      if (!service) throw new Error('Asset service unavailable');
      const next = await service.update(asset, input);
      setAssets((current) =>
        current.map((item) => (item.id === next.id ? next : item))
      );
      return next;
    },
    [service]
  );
  const remove = useCallback(
    async (asset: PersonalAsset) => {
      if (!service) throw new Error('Asset service unavailable');
      await service.remove(asset);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    },
    [service]
  );
  return useMemo(
    () => ({
      assets,
      loading,
      failed,
      available: service !== null,
      service,
      reload,
      create,
      update,
      remove
    }),
    [assets, loading, failed, service, reload, create, update, remove]
  );
}
const Context = createContext<ReturnType<typeof useAssetStore> | null>(null);
export function AssetLibraryProvider({
  service,
  children
}: {
  service: PersonalAssetsService | null;
  children: ReactNode;
}) {
  const value = useAssetStore(service);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAssetLibrary = () => useContext(Context);
