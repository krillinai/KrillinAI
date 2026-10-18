import type {
  PersonalAsset,
  PersonalAssetBundle,
  PersonalAssetInput
} from '@opencreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

export function createPersonalAssetsService(
  client: Pick<RuntimeClient, 'get' | 'post' | 'delete' | 'rawRequest'>
) {
  return {
    list: () => client.get<{ assets: PersonalAsset[] }>('/assets'),
    create: (asset: PersonalAssetInput) =>
      client.post<PersonalAsset>('/assets', asset),
    async update(asset: PersonalAsset, input: PersonalAssetInput) {
      const response = await client.rawRequest(
        `/assets/${encodeURIComponent(asset.id)}`,
        { method: 'PUT', body: { asset: input, revision: asset.revision } }
      );
      return response.json() as Promise<PersonalAsset>;
    },
    remove: (asset: PersonalAsset) =>
      client.delete(
        `/assets/${encodeURIComponent(asset.id)}?revision=${asset.revision}`
      ),
    export: () => client.get<PersonalAssetBundle>('/assets/export'),
    import: (bundle: unknown) =>
      client.post<{ assets: PersonalAsset[] }>('/assets/import', bundle),
    migrateStyles: (styles: unknown) =>
      client.post<{ assets: PersonalAsset[] }>(
        '/assets/migrate-subtitle-styles',
        styles
      )
  };
}
export type PersonalAssetsService = ReturnType<
  typeof createPersonalAssetsService
>;
