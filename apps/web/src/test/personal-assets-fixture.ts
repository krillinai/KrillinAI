import { vi } from 'vitest';
import {
  defaultSubtitleStyleAsset,
  type PersonalAsset,
  type PersonalAssetInput
} from '@opencreator/protocol';
import type { PersonalAssetsService } from '../services/personal-assets-service.js';

export function createAssetFixture(initial: PersonalAsset[] = []) {
  let assets = structuredClone(initial);
  let sequence = 0;
  const create = vi.fn(async (input: PersonalAssetInput) => {
    const asset = {
      ...structuredClone(input),
      id: `fixture-${++sequence}`,
      revision: 1,
      createdAt: '2026-10-17T00:00:00Z',
      updatedAt: '2026-10-17T00:00:00Z'
    } as PersonalAsset;
    assets.push(asset);
    return structuredClone(asset);
  });
  const service: PersonalAssetsService = {
    list: vi.fn(async () => ({ assets: structuredClone(assets) })),
    create,
    update: vi.fn(async (asset, input) => {
      const next = {
        ...asset,
        ...structuredClone(input),
        revision: asset.revision + 1
      } as PersonalAsset;
      assets = assets.map((a) => (a.id === asset.id ? next : a));
      return structuredClone(next);
    }),
    remove: vi.fn(async (asset) => {
      assets = assets.filter((a) => a.id !== asset.id);
    }),
    migrateStyles: vi.fn(async (raw) => {
      for (const item of raw as { id: string; name: string; style: object }[]) {
        if (!assets.some((a) => a.id === item.id)) {
          assets.push({
            id: item.id,
            name: item.name,
            kind: 'subtitle-style',
            data: { ...defaultSubtitleStyleAsset, ...item.style },
            revision: 1,
            createdAt: '2026-10-17T00:00:00Z',
            updatedAt: '2026-10-17T00:00:00Z'
          });
        }
      }
      return { assets: structuredClone(assets) };
    }),
    export: vi.fn(async () => ({
      format: 'opencreator-assets' as const,
      version: 1 as const,
      assets: assets.map(
        ({ name, kind, data }) => ({ name, kind, data }) as PersonalAssetInput
      )
    })),
    import: vi.fn(async () => ({ assets: [] }))
  };
  return { service, assets: () => assets };
}
