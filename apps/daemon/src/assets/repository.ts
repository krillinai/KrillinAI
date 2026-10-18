import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { personalAssetInputSchema as assetInput } from './schema.js';
import type {
  PersonalAsset,
  PersonalAssetBundle,
  PersonalAssetInput
} from '@opencreator/protocol';

export class AssetError extends Error {
  constructor(
    public code: 'ASSET_NOT_FOUND' | 'ASSET_REVISION_CONFLICT',
    public status: number
  ) {
    super(code);
  }
}
export function parsePersonalAsset(input: unknown): PersonalAssetInput {
  return assetInput.parse(input) as PersonalAssetInput;
}
export type PersonalAssetRepository = {
  list(): PersonalAsset[];
  get(id: string): PersonalAsset;
  create(input: unknown, migrationKey?: string): PersonalAsset;
  update(id: string, input: unknown, revision: number): PersonalAsset;
  remove(id: string, revision: number): void;
  export(): PersonalAssetBundle;
  import(input: unknown): PersonalAsset[];
  migrateStyles(input: unknown): PersonalAsset[];
};
export function createPersonalAssetRepository(
  db: Database.Database
): PersonalAssetRepository {
  const list = () =>
    (
      db
        .prepare(
          'SELECT record_json FROM personal_assets WHERE deleted = 0 ORDER BY created_at, id'
        )
        .all() as { record_json: string }[]
    ).map((row) => JSON.parse(row.record_json) as PersonalAsset);
  const get = (id: string) => {
    const row = db
      .prepare(
        'SELECT record_json FROM personal_assets WHERE id = ? AND deleted = 0'
      )
      .get(id) as { record_json: string } | undefined;
    if (!row) throw new AssetError('ASSET_NOT_FOUND', 404);
    return JSON.parse(row.record_json) as PersonalAsset;
  };
  const create = (input: unknown, migrationKey?: string) => {
    const parsed = parsePersonalAsset(input);
    const now = new Date().toISOString();
    const asset = {
      ...parsed,
      id: `asset_${nanoid()}`,
      revision: 1,
      createdAt: now,
      updatedAt: now
    } as PersonalAsset;
    db.prepare(
      'INSERT INTO personal_assets(id,record_json,created_at,migration_key) VALUES(?,?,?,?)'
    ).run(asset.id, JSON.stringify(asset), now, migrationKey ?? null);
    return asset;
  };
  const update = db.transaction(
    (id: string, input: unknown, revision: number) => {
      const previous = get(id);
      if (previous.revision !== revision)
        throw new AssetError('ASSET_REVISION_CONFLICT', 409);
      const parsed = parsePersonalAsset(input);
      if (parsed.kind !== previous.kind)
        throw new AssetError('ASSET_REVISION_CONFLICT', 409);
      const next = {
        ...previous,
        ...parsed,
        revision: previous.revision + 1,
        updatedAt: new Date().toISOString()
      } as PersonalAsset;
      db.prepare('UPDATE personal_assets SET record_json = ? WHERE id = ?').run(
        JSON.stringify(next),
        id
      );
      return next;
    }
  );
  return {
    list,
    get,
    create,
    update,
    remove: db.transaction((id: string, revision: number) => {
      if (get(id).revision !== revision)
        throw new AssetError('ASSET_REVISION_CONFLICT', 409);
      db.prepare('UPDATE personal_assets SET deleted = 1 WHERE id = ?').run(id);
    }),
    export(): PersonalAssetBundle {
      return {
        format: 'opencreator-assets',
        version: 1,
        assets: list().map(
          ({ name, kind, data }) => ({ name, kind, data }) as PersonalAssetInput
        )
      };
    },
    import: db.transaction((input: unknown) => {
      const bundle = z
        .object({
          format: z.literal('opencreator-assets'),
          version: z.literal(1),
          assets: z.array(assetInput).max(1000)
        })
        .strict()
        .parse(input);
      return bundle.assets.map((asset) => create(asset));
    }),
    migrateStyles: db.transaction((input: unknown) => {
      const styles = z
        .array(
          z.object({
            id: z.string().trim().min(1).max(160),
            name: z.string().trim().min(1).max(160),
            style: assetInput.options[2].shape.data
          })
        )
        .max(100)
        .parse(input);
      for (const item of styles) {
        const key = `browser-subtitle-style:${item.id}`;
        if (
          !db
            .prepare('SELECT id FROM personal_assets WHERE migration_key = ?')
            .get(key)
        )
          create(
            { name: item.name, kind: 'subtitle-style', data: item.style },
            key
          );
      }
      return list();
    })
  };
}
