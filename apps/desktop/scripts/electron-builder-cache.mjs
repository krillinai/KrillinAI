import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

export function prepareElectronBuilderCache(cacheRoot) {
  mkdirSync(cacheRoot, { recursive: true });
  const packagePath = join(cacheRoot, 'package.json');
  let packageJson = {};
  if (existsSync(packagePath)) {
    try {
      packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    } catch {
      packageJson = {};
    }
  }
  if (packageJson.private === true && packageJson.type === 'commonjs') return;
  writeFileSync(packagePath, `${JSON.stringify({
    ...packageJson,
    private: true,
    type: 'commonjs'
  }, null, 2)}\n`);
}
