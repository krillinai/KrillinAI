import { basename, dirname, join } from 'node:path';

export function resolveDesktopUserDataPath(
  defaultPath: string,
  development: boolean
): string {
  if (!development) return defaultPath;
  return join(
    dirname(defaultPath),
    `${basename(defaultPath)} Development`
  );
}
