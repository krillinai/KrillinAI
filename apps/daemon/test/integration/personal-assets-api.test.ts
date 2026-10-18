import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import {
  defaultSubtitleStyleAsset,
  resolveTranslationDictionaries,
  type DictionaryAsset
} from '@opencreator/protocol';
import { migrate } from '../../src/storage/migrations.js';
import { registerPersonalAssetRoutes } from '../../src/api/routes.personal-assets.js';
import { createVideoTranslationTemplate } from '../../src/creator/templates/video-translation.js';
import { buildKrillinStageOptions } from '../../src/creator/krillin/adapter.js';
import { buildKrillinCliCommandArguments } from '../../src/creator/krillin/cli-runner.js';

const resources: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const close of resources.splice(0).reverse()) await close();
});
async function setup() {
  const db = new Database(':memory:');
  migrate(db);
  resources.push(() => { db.close(); });
  const app = Fastify();
  resources.push(() => app.close());
  await registerPersonalAssetRoutes(app, db);
  await app.ready();
  return app;
}
const dictionary = {
  kind: 'dictionary',
  name: 'Product',
  data: {
    entries: [
      {
        source: 'OpenCreator',
        targetLanguage: 'zh_cn',
        translation: '开放创作',
        preserveOriginal: false,
        note: 'Product name'
      }
    ]
  }
};
describe('personal asset API', () => {
  it('persists edits with optimistic revisions and preserves task dictionary snapshots', async () => {
    const app = await setup();
    const created = await app.inject({
      method: 'POST',
      url: '/assets',
      payload: dictionary
    });
    expect(created.statusCode).toBe(200);
    const asset = created.json();
    const snapshot = structuredClone(asset);
    const next = {
      ...dictionary,
      name: 'Renamed',
      data: {
        entries: [{ ...dictionary.data.entries[0], translation: '新名称' }]
      }
    };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/assets/${asset.id}`,
          payload: { asset: next, revision: 1 }
        })
      ).json()
    ).toMatchObject({ revision: 2, name: 'Renamed' });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/assets/${asset.id}`,
          payload: { asset: next, revision: 1 }
        })
      ).statusCode
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/assets/${asset.id}?revision=1`
        })
      ).statusCode
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/assets/${asset.id}?revision=2`
        })
      ).statusCode
    ).toBe(200);
    expect((await app.inject('/assets')).json().assets).toEqual([]);
    const state = createVideoTranslationTemplate().inputSchema.parse({
      translationDictionaries: [snapshot],
      targetLanguage: 'zh_cn'
    }) as never;
    const options = buildKrillinStageOptions({
      job: { templateId: 'video-translation', state },
      stageRun: { stageId: 'subtitle' }
    } as never);
    expect(options.translationGlossary).toEqual([
      { source: 'OpenCreator', translation: '开放创作', note: 'Product name' }
    ]);
    expect(
      buildKrillinCliCommandArguments(
        {
          workdir: '/tmp/task',
          stageRun: { id: 's1', stageId: 'subtitle' }
        } as never,
        [{ kind: 'source_subtitle', path: '/tmp/input.srt' }] as never,
        { ...options, sourceType: 'subtitle' },
        undefined,
        undefined,
        '/tmp/glossary.json'
      )
    ).toContain('--glossary-file');
  });
  it('validates import atomically, exports portable data and imports as independent assets', async () => {
    const app = await setup();
    await app.inject({ method: 'POST', url: '/assets', payload: dictionary });
    const exported = (await app.inject('/assets/export')).json();
    expect(exported).toEqual({
      format: 'opencreator-assets',
      version: 1,
      assets: [dictionary]
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/assets/import',
          payload: {
            ...exported,
            assets: [dictionary, { kind: 'voice', name: 'Invalid', data: {} }]
          }
        })
      ).statusCode
    ).toBe(400);
    expect((await app.inject('/assets')).json().assets).toHaveLength(1);
    await app.inject({
      method: 'POST',
      url: '/assets/import',
      payload: exported
    });
    const assets = (await app.inject('/assets')).json().assets;
    expect(assets).toHaveLength(2);
    expect(assets[0].id).not.toBe(assets[1].id);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/assets',
          payload: {
            kind: 'voice',
            name: 'Voice',
            data: {
              provider: 'volcengine',
              model: 'seed-icl-2.0',
              voiceId: 'S_local',
              language: 'en',
              apiKey: 'secret'
            }
          }
        })
      ).statusCode
    ).toBe(400);
  });
  it('migrates browser styles once, never overwriting edits or resurrecting deleted assets', async () => {
    const app = await setup();
    const payload = [
      { id: 'saved-1', name: 'Legacy', style: defaultSubtitleStyleAsset }
    ];
    const request = () =>
      app.inject({
        method: 'POST',
        url: '/assets/migrate-subtitle-styles',
        payload
      });
    const asset = (await request()).json().assets[0];
    await app.inject({
      method: 'PUT',
      url: `/assets/${asset.id}`,
      payload: {
        revision: 1,
        asset: {
          kind: 'subtitle-style',
          name: 'Updated',
          data: { ...defaultSubtitleStyleAsset, subtitleColor: '#ffff00' }
        }
      }
    });
    expect((await request()).json().assets).toHaveLength(1);
    expect((await request()).json().assets[0].name).toBe('Updated');
    await app.inject({
      method: 'DELETE',
      url: `/assets/${asset.id}?revision=2`
    });
    expect((await request()).json().assets).toEqual([]);
  });
  it('filters by target language, preserves originals and reports conflicting dictionary choices', () => {
    const asset = (entries: unknown[]) =>
      ({
        ...dictionary,
        data: { entries },
        id: 'd1',
        revision: 1,
        createdAt: '',
        updatedAt: ''
      }) as DictionaryAsset;
    const first = asset([
      { ...dictionary.data.entries[0], targetLanguage: 'zh-CN' },
      {
        source: 'Keep',
        targetLanguage: '*',
        translation: '',
        preserveOriginal: true,
        note: ''
      }
    ]);
    const second = asset([
      { ...dictionary.data.entries[0], translation: '不同译文' },
      { ...dictionary.data.entries[0], source: 'French', targetLanguage: 'fr' }
    ]);
    const result = resolveTranslationDictionaries([first, second], 'zh_cn');
    expect(result.conflicts).toEqual(['OpenCreator']);
    expect(result.entries.map((e) => e.source)).toEqual([
      'OpenCreator',
      'Keep'
    ]);
    expect(result.entries[0]?.translation).toBe('开放创作');
  });
});

describe('asset storage lifecycle', () => {
  it('retains asset records and revisions when reopening the database', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { openRuntimeDatabase } = await import(
      '../../src/storage/database.js'
    );
    const { createPersonalAssetRepository } = await import(
      '../../src/assets/repository.js'
    );
    const directory = mkdtempSync(join(tmpdir(), 'opencreator-assets-'));
    try {
      const path = join(directory, 'app.sqlite');
      let db = openRuntimeDatabase(path);
      const first = createPersonalAssetRepository(db).create(dictionary);
      db.close();
      db = openRuntimeDatabase(path);
      expect(createPersonalAssetRepository(db).get(first.id)).toEqual(first);
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
