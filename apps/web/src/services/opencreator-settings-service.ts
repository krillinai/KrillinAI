import type {
  OpenCreatorUiSettingsResponse,
  UpdateOpenCreatorUiSettingsRequest
} from '@opencreator/protocol';
import type { RuntimeClient } from '../runtime/client.js';

type ClientLike = Pick<RuntimeClient, 'get' | 'patch'>;

export function createOpenCreatorSettingsService(client: ClientLike) {
  return {
    getUiSettings(): Promise<OpenCreatorUiSettingsResponse> {
      return client.get('/settings/ui');
    },
    updateUiSettings(
      update: UpdateOpenCreatorUiSettingsRequest
    ): Promise<OpenCreatorUiSettingsResponse> {
      return client.patch('/settings/ui', update);
    }
  };
}

export type OpenCreatorSettingsService =
  ReturnType<typeof createOpenCreatorSettingsService>;
