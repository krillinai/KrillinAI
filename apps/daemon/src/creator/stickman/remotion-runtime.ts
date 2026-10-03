import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const runtimeManifestSchema = z.object({
  version: z.literal(1),
  platform: z.string().min(1),
  arch: z.string().min(1),
  remotionVersion: z.string().min(1),
  chromiumVersion: z.string().min(1),
  bundlePath: z.string().min(1),
  browserExecutable: z.string().min(1),
  rendererEntry: z.string().min(1).optional(),
  resources: z.array(z.object({
    path: z.string().min(1),
    kind: z.enum(['bundle', 'browser', 'renderer', 'font', 'character', 'brand', 'audio', 'visual-asset']),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    bytes: z.number().int().nonnegative(),
    version: z.string().min(1),
    platform: z.string().min(1),
    arch: z.string().min(1)
  }).strict()).min(1)
}).strict();

export type StickmanRemotionRuntime = {
  root: string;
  bundlePath: string;
  browserExecutable: string;
  rendererEntry?: string;
};

export function readStickmanRemotionRuntime(rootPath: string, verifyHashes = false): StickmanRemotionRuntime {
  const root = resolve(rootPath);
  const manifest = runtimeManifestSchema.parse(JSON.parse(
    readFileSync(resolveInside(root, 'manifest.json'), 'utf8')
  ));
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error('stickman_runtime_wrong_platform');
  }
  for (const resource of manifest.resources) {
    const path = resolveInside(root, resource.path);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`stickman_runtime_resource_missing: ${resource.path}`);
    }
    if (verifyHashes && (lstatSync(path).isSymbolicLink()
      || statSync(path).size !== resource.bytes
      || createHash('sha256').update(readFileSync(path)).digest('hex') !== resource.sha256)) {
      throw new Error(`stickman_runtime_resource_invalid: ${resource.path}`);
    }
  }
  if (verifyHashes) {
    const expected = new Set(['manifest.json', ...manifest.resources.map(resource => resource.path)]);
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (!entry.isFile() || !expected.delete(relative(root, path).split(sep).join('/'))) {
          throw new Error(`stickman_runtime_unexpected_resource: ${entry.name}`);
        }
      }
    };
    visit(root);
    if (expected.size !== 0) throw new Error('stickman_runtime_incomplete');
  }
  return {
    root,
    bundlePath: resolveInside(root, manifest.bundlePath),
    browserExecutable: resolveInside(root, manifest.browserExecutable),
    ...(manifest.rendererEntry ? { rendererEntry: resolveInside(root, manifest.rendererEntry) } : {})
  };
}

export function resolveInside(root: string, child: string): string {
  const target = resolve(root, child);
  const value = relative(resolve(root), target);
  if (value === '' || (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))) {
    return target;
  }
  throw new Error(`stickman_runtime_path_escape: ${child}`);
}
