import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function treeSize(root) {
  let total = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      if (!existsSync(path)) {
        throw new Error(`Desktop package contains a broken symbolic link: ${path}`);
      }
      // Archives store the link target path, not another copy of its contents.
      total += stat.size;
    } else if (stat.isDirectory()) {
      total += treeSize(path);
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}
