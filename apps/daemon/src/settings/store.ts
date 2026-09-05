import {
  readOpenCreatorConfig,
  resolveUiSettings,
  updateOpenCreatorUiSettings
} from '@opencreator/config';
import type {
  OpenCreatorUiSettingsResponse,
  UpdateOpenCreatorUiSettingsRequest
} from '@opencreator/protocol';

export type OpenCreatorSettingsStore = ReturnType<typeof createOpenCreatorSettingsStore>;

export function createOpenCreatorSettingsStore(configFile: string) {
  return {
    readUi(): OpenCreatorUiSettingsResponse {
      const snapshot = readOpenCreatorConfig(configFile);
      return {
        settings: resolveUiSettings(snapshot),
        configured: snapshot.configured.ui
      };
    },
    updateUi(update: UpdateOpenCreatorUiSettingsRequest): OpenCreatorUiSettingsResponse {
      const snapshot = updateOpenCreatorUiSettings(configFile, update);
      return {
        settings: resolveUiSettings(snapshot),
        configured: true
      };
    }
  };
}
