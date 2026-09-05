import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync
} from 'node:fs';
import { join } from 'node:path';
import {
  migrateDirectoryIfEmpty,
  type DirectoryMigrationResult
} from '@opencreator/config';

export type LegacyProductDataMigration = {
  name: 'creator-codex' | 'yt-dlp' | 'krillinai-dependencies' | 'creator-jobs';
  result: DirectoryMigrationResult;
  legacyRemoved: boolean;
};

export function migrateLegacyDaemonProductData(input: {
  dataDir: string;
  runtimeDir: string;
  creatorDir: string;
}): LegacyProductDataMigration[] {
  const migrations = [
    {
      name: 'creator-codex' as const,
      source: join(input.dataDir, 'creator-runtime', 'codex-home'),
      target: join(input.runtimeDir, 'creator-codex')
    },
    {
      name: 'yt-dlp' as const,
      source: join(input.dataDir, 'creator-runtime', 'yt-dlp'),
      target: join(input.runtimeDir, 'yt-dlp')
    },
    {
      name: 'krillinai-dependencies' as const,
      source: join(
        input.dataDir,
        'creator-runtime',
        'dependencies',
        'krillinai'
      ),
      target: join(input.runtimeDir, 'krillinai', 'dependencies')
    },
    {
      name: 'creator-jobs' as const,
      source: join(input.dataDir, 'creator', 'jobs'),
      target: join(input.creatorDir, 'jobs')
    }
  ].map(migration => {
    const result = migrateDirectoryIfEmpty(migration.source, migration.target);
    const legacyRemoved = result.migrated;
    if (legacyRemoved) {
      rmSync(migration.source, { recursive: true, force: true });
    }
    return {
      name: migration.name,
      result,
      legacyRemoved
    };
  });

  removeEmptyDirectory(join(input.dataDir, 'creator-runtime', 'dependencies'));
  removeEmptyDirectory(join(input.dataDir, 'creator-runtime'));
  removeEmptyDirectory(join(input.dataDir, 'creator'));
  return migrations;
}

export function consolidateLegacyConfigData(input: {
  dataDir: string;
  appHome: string;
}): void {
  const sourceDir = join(input.dataDir, 'legacy');
  if (existsSync(sourceDir)) {
    const targetDir = join(input.appHome, 'legacy');
    mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(sourceDir).sort()) {
      if (!/^clawee-config(?:-\d+)?\.toml$/.test(name)) continue;
      const source = join(sourceDir, name);
      const sourceContents = readFileSync(source);
      const duplicate = readdirSync(targetDir)
        .filter(candidate => /^clawee-config(?:-\d+)?\.toml$/.test(candidate))
        .map(candidate => join(targetDir, candidate))
        .find(candidate => readFileSync(candidate).equals(sourceContents));
      if (duplicate !== undefined) {
        rmSync(source);
        continue;
      }
      renameSync(source, nextLegacyConfigPath(targetDir));
    }
  }
  removeEmptyLegacyDataDirectories(input.dataDir);
}

export function removeEmptyLegacyDataDirectories(dataDir: string): void {
  removeEmptyDirectory(join(dataDir, 'config'));
  removeEmptyDirectory(join(dataDir, 'legacy'));
}

function nextLegacyConfigPath(targetDir: string): string {
  let destination = join(targetDir, 'clawee-config.toml');
  let suffix = 2;
  while (existsSync(destination)) {
    destination = join(targetDir, `clawee-config-${suffix}.toml`);
    suffix += 1;
  }
  return destination;
}

function removeEmptyDirectory(path: string): void {
  if (!existsSync(path) || readdirSync(path).length > 0) return;
  rmdirSync(path);
}
