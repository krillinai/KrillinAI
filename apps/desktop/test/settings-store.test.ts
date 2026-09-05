import { describe, expect, it, vi } from 'vitest';
import {
  createSettingsStore,
  type SettingsPersistence
} from '../src/main/settings-store.js';
import type { OpenCreatorConfigSnapshot } from '@opencreator/config';

const emptySnapshot = (): OpenCreatorConfigSnapshot => ({
  document: { version: 1 },
  configured: {
    ui: false,
    desktop: false,
    runtime: false,
    creatorServices: false
  }
});

describe('SettingsStore', () => {
  it('uses defaults when persisted TOML is corrupt', () => {
    const persistence: SettingsPersistence = {
      read: () => {
        throw new Error('broken');
      },
      update: vi.fn(() => emptySnapshot()),
      readLegacy: () => {
        throw new Error('missing');
      }
    };
    const store = createSettingsStore('/virtual/config.toml', persistence);

    expect(store.read()).toMatchObject({
      closeBehavior: 'hide',
      notificationsEnabled: true
    });
  });

  it('writes normalized settings through the injected atomic adapter', () => {
    const update = vi.fn((_path, apply) => ({
      ...emptySnapshot(),
      document: apply({ version: 1 })
    }));
    const persistence: SettingsPersistence = {
      read: () => ({
        document: {
          version: 1,
          desktop: {
            closeBehavior: 'hide',
            notificationsEnabled: true
          }
        },
        configured: {
          ...emptySnapshot().configured,
          desktop: true
        }
      }),
      update,
      readLegacy: () => {
        throw new Error('missing');
      }
    };
    const store = createSettingsStore('/virtual/config.toml', persistence);

    store.update({ closeBehavior: 'quit' });

    expect(update).toHaveBeenCalledOnce();
    const apply = update.mock.calls[0]![1];
    expect(apply({ version: 1 }).desktop?.closeBehavior).toBe('quit');
    expect(store.read().closeBehavior).toBe('quit');
  });

  it('imports legacy desktop JSON into config.toml sections once', () => {
    const update = vi.fn((_path, apply) => ({
      ...emptySnapshot(),
      document: apply({ version: 1 })
    }));
    const persistence: SettingsPersistence = {
      read: emptySnapshot,
      update,
      readLegacy: () => JSON.stringify({
        closeBehavior: 'quit',
        notificationsEnabled: false,
        codexRuntimeMode: 'external',
        externalCodexBin: '/opt/codex'
      })
    };

    const store = createSettingsStore(
      '/virtual/config.toml',
      persistence,
      '/legacy/desktop-settings.json'
    );

    expect(store.read()).toMatchObject({
      closeBehavior: 'quit',
      notificationsEnabled: false,
      codexRuntimeMode: 'external',
      externalCodexBin: '/opt/codex'
    });
    const migrated = update.mock.calls[0]![1]({ version: 1 });
    expect(migrated.desktop).toMatchObject({
      closeBehavior: 'quit',
      notificationsEnabled: false
    });
    expect(migrated.runtime).toMatchObject({
      codexMode: 'external',
      externalCodexBin: '/opt/codex'
    });
  });
});
