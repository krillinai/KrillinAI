import { join } from 'node:path';
import {
  migrateDirectoryIfEmpty,
  type DirectoryMigrationResult,
  type OpenCreatorPaths
} from '@opencreator/config';

export type ProductDataMigration = {
  name: 'codex';
  result: DirectoryMigrationResult;
};

export function migrateProductData(input: {
  paths: OpenCreatorPaths;
  legacyElectronUserData: string;
}): ProductDataMigration[] {
  return [
    {
      name: 'codex',
      result: migrateDirectoryIfEmpty(
        join(input.legacyElectronUserData, 'runtime', 'codex', 'home'),
        input.paths.codexHome
      )
    }
  ];
}
