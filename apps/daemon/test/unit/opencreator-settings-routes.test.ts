import Fastify, { type FastifyInstance } from 'fastify';
import type { OpenCreatorUiSettingsResponse } from '@opencreator/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSettingsRoutes } from '../../src/api/routes.settings.js';
import type { OpenCreatorSettingsStore } from '../../src/settings/store.js';

describe('OpenCreator settings routes', () => {
  let server: FastifyInstance;
  let store: OpenCreatorSettingsStore;

  beforeEach(async () => {
    store = {
      readUi: vi.fn((): OpenCreatorUiSettingsResponse => ({
        configured: false,
        settings: {
          language: 'system',
          colorMode: 'dark',
          accentColor: 'red',
          customAccentColor: '#3b82f6',
          defaultPermission: 'danger-full-access'
        }
      })),
      updateUi: vi.fn((update): OpenCreatorUiSettingsResponse => ({
        configured: true,
        settings: {
          language: update.language ?? 'system',
          colorMode: update.colorMode ?? 'dark',
          accentColor: update.accentColor ?? 'red',
          customAccentColor: update.customAccentColor ?? '#3b82f6',
          defaultPermission: update.defaultPermission ?? 'danger-full-access'
        }
      }))
    };
    server = Fastify({ logger: false });
    await registerSettingsRoutes(server, store);
  });

  afterEach(async () => {
    await server.close();
  });

  it('reads and updates UI settings', async () => {
    expect((await server.inject({
      method: 'GET',
      url: '/settings/ui'
    })).json()).toMatchObject({
      configured: false,
      settings: { accentColor: 'red' }
    });

    const updated = await server.inject({
      method: 'PATCH',
      url: '/settings/ui',
      payload: {
        language: 'zh-CN',
        colorMode: 'light',
        accentColor: 'red'
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(store.updateUi).toHaveBeenCalledWith({
      language: 'zh-CN',
      colorMode: 'light',
      accentColor: 'red'
    });
  });

  it('rejects unknown or malformed settings', async () => {
    const response = await server.inject({
      method: 'PATCH',
      url: '/settings/ui',
      payload: {
        accentColor: 'green',
        unknown: true
      }
    });

    expect(response.statusCode).toBe(400);
    expect(store.updateUi).not.toHaveBeenCalled();
  });
});
