import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { CreatorJson, CreatorRuntimeComponent } from '@opencreator/protocol';
import { configuredOrDownloadedFile } from '../krillin/dependency-loader.js';
import { spawnCreatorProcess } from '../process-tree.js';
import { readStickmanRemotionRuntime, type StickmanRemotionRuntime } from './remotion-runtime.js';

export const remotionComponentReleaseSchema = z.object({
  version: z.literal(1),
  id: z.literal('remotion'),
  componentVersion: z.string().min(1),
  remotionVersion: z.string().min(1),
  chromiumVersion: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux']),
  arch: z.enum(['arm64', 'x64']),
  archiveUrl: z.string().url(),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  fileName: z.string().regex(/^Remotion-[a-zA-Z0-9._-]+\.tar\.gz$/)
}).strict();

export type RemotionComponentRelease = z.infer<typeof remotionComponentReleaseSchema>;
type Progress = Record<string, CreatorJson>;

export function createRemotionComponentManager(input: {
  root: string;
  releasePath: string;
  archivePath?: string;
  developmentArchiveRoot?: string;
  readProxy(): Promise<string>;
}) {
  let release: RemotionComponentRelease | undefined;
  let releaseError: string | undefined;
  let prepared: StickmanRemotionRuntime | undefined;
  let installedAt: string | null = null;
  let pending: Promise<StickmanRemotionRuntime> | undefined;
  let controller: AbortController | undefined;
  let closed = false;
  let progress: Progress = {};
  let state: CreatorRuntimeComponent['state'] = 'not_installed';
  let error: string | null = null;
  const listeners = new Set<(progress: Progress) => void>();

  async function readRelease(force = false) {
    if (release && !force) return release;
    try {
      const value = remotionComponentReleaseSchema.parse(JSON.parse(await readFile(input.releasePath, 'utf8')));
      if (value.platform !== process.platform || value.arch !== process.arch) throw new Error('remotion_component_wrong_platform');
      release = value;
      releaseError = undefined;
      return value;
    } catch (cause) {
      releaseError = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    }
  }

  function publish(next: Progress) {
    progress = next;
    for (const listener of listeners) listener(next);
  }

  async function verifyRuntime(root: string, value: RemotionComponentRelease) {
    const manifestPath = join(root, 'manifest.json');
    const manifestContents = await readFile(manifestPath);
    if (createHash('sha256').update(manifestContents).digest('hex') !== value.manifestSha256) throw new Error('remotion_component_manifest_hash_mismatch');
    const runtime = readStickmanRemotionRuntime(root, true);
    const manifest = JSON.parse(manifestContents.toString()) as { remotionVersion: string; chromiumVersion: string; rendererEntry?: string; resources: Array<{ path: string; kind: string }> };
    if (!runtime.rendererEntry || !manifest.resources.some(resource => resource.path === manifest.rendererEntry && resource.kind === 'renderer') || manifest.remotionVersion !== value.remotionVersion || manifest.chromiumVersion !== value.chromiumVersion) throw new Error('remotion_component_version_mismatch');
    return runtime;
  }

  async function inspectInstalled(value: RemotionComponentRelease) {
    const root = join(input.root, value.manifestSha256);
    const runtime = await verifyRuntime(root, value);
    const manifestPath = join(root, 'manifest.json');
    installedAt = (await stat(manifestPath)).mtime.toISOString();
    prepared = runtime;
    return runtime;
  }

  async function install(): Promise<StickmanRemotionRuntime> {
    const value = await readRelease(true);
    try { return await inspectInstalled(value); } catch { prepared = undefined; }
    const signal = controller!.signal;
    const staging = join(input.root, `.install-${randomUUID()}`);
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      const archive = await configuredOrDownloadedFile({
        configured: input.archivePath ?? (input.developmentArchiveRoot ? join(input.developmentArchiveRoot, value.fileName) : undefined), name: 'Remotion rendering component',
        url: value.archiveUrl, sha256: value.archiveSha256, path: join(staging, value.fileName),
        proxy: await input.readProxy(), signal,
        onProgress(update) {
          state = update.state;
          const percent = update.totalBytes ? Math.min(100, (update.downloadedBytes ?? 0) / update.totalBytes * 100) : null;
          publish({ phase: 'preparing_dependencies', percent: percent === null ? 1 : percent * 0.05,
            message: '正在准备 Remotion 渲染组件，完成后将自动继续渲染。',
            dependency: 'remotion', dependencyItem: update.item, dependencyPercent: percent,
            downloadedBytes: update.downloadedBytes ?? 0, totalBytes: update.totalBytes ?? value.bytes,
            bytesPerSecond: update.bytesPerSecond ?? null, remainingSeconds: update.remainingSeconds ?? null });
        }
      });
      if ((await stat(archive)).size !== value.bytes) throw new Error('remotion_component_archive_size_mismatch');
      state = 'extracting';
      publish({ phase: 'preparing_dependencies', percent: 4, message: '正在安装并校验 Remotion 渲染组件。', dependency: 'remotion' });
      const listing = await runTar(['-tvzf', archive], staging, signal);
      if (listing.split('\n').filter(Boolean).some(line => !/^[-d]/.test(line) || / -> | link to /.test(line))) throw new Error('remotion_component_archive_links_not_allowed');
      const names = await runTar(['-tzf', archive], staging, signal);
      for (const name of names.split('\n').filter(Boolean)) {
        const normalized = name.replaceAll('\\', '/');
        if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').includes('..')) throw new Error('remotion_component_archive_path_escape');
      }
      const extracted = join(staging, 'runtime');
      await mkdir(extracted);
      await runTar(['-xzf', archive, '-C', extracted], staging, signal);
      await verifyRuntime(extracted, value);
      if (signal.aborted) throw new Error('remotion_component_install_canceled');
      const target = join(input.root, value.manifestSha256);
      const backup = `${target}.invalid-${randomUUID()}`;
      const hadTarget = await stat(target).then(() => true, () => false);
      if (hadTarget) await rename(target, backup);
      try { await rename(extracted, target); } catch (cause) {
        if (hadTarget) await rename(backup, target);
        throw cause;
      }
      await rm(backup, { recursive: true, force: true });
      return await inspectInstalled(value);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  function start() {
    if (closed) throw new Error('remotion_component_manager_closed');
    if (!pending) {
      controller = new AbortController();
      state = 'verifying';
      error = null;
      publish({ phase: 'preparing_dependencies', percent: 1, dependency: 'remotion', message: '正在检查 Remotion 渲染组件，缺失时将按需下载。' });
      pending = install().then(runtime => {
        state = 'ready';
        publish({ phase: 'dependencies_ready', percent: 5, dependency: 'remotion', message: 'Remotion 渲染组件已就绪，正在开始渲染。' });
        return runtime;
      }).catch(cause => {
        state = 'failed';
        error = cause instanceof Error ? cause.message : String(cause);
        throw cause;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  }

  return {
    async status(): Promise<CreatorRuntimeComponent> {
      try {
        const value = await readRelease();
        if (!pending && !prepared && state !== 'failed') {
          try { await inspectInstalled(value); state = 'ready'; } catch { state = 'not_installed'; }
        }
      } catch { state = 'unsupported'; }
      return {
        id: 'remotion', name: 'Remotion', available: release !== undefined,
        version: prepared ? release?.remotionVersion ?? null : null,
        supportedVersion: release?.remotionVersion ?? null, installedAt, path: resolve(input.root),
        source: 'OpenCreator release · SHA-256 verified', models: [], model: null,
        state, item: typeof progress.dependencyItem === 'string' ? progress.dependencyItem : null,
        downloadedBytes: numeric(progress.downloadedBytes) ?? 0, totalBytes: numeric(progress.totalBytes),
        percent: state === 'ready' ? 100 : numeric(progress.dependencyPercent),
        bytesPerSecond: numeric(progress.bytesPerSecond), remainingSeconds: numeric(progress.remainingSeconds),
        error: error ?? releaseError ?? null
      };
    },
    async download() {
      await readRelease(true);
      prepared = undefined;
      void start().catch(() => {});
      return this.status();
    },
    async ensure(request: { signal: AbortSignal; reportProgress(progress: Progress): void }): Promise<StickmanRemotionRuntime> {
      if (request.signal.aborted) throw canceled();
      const operation = start();
      listeners.add(request.reportProgress);
      request.reportProgress(progress);
      try {
        return await new Promise((resolvePromise, reject) => {
          const abort = () => reject(canceled());
          request.signal.addEventListener('abort', abort, { once: true });
          operation.then(resolvePromise, reject).finally(() => request.signal.removeEventListener('abort', abort));
        });
      } finally { listeners.delete(request.reportProgress); }
    },
    close() { closed = true; controller?.abort(); }
  };
}

export type RemotionComponentManager = ReturnType<typeof createRemotionComponentManager>;

function canceled() { return Object.assign(new Error('Creator stage was canceled'), { code: 'creator_stage_canceled' }); }
function numeric(value: CreatorJson | undefined) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }

async function runTar(args: string[], cwd: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawnCreatorProcess('tar', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }, signal);
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', chunk => { stdout += String(chunk); });
    child.stderr!.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolvePromise(stdout) : reject(new Error(stderr || 'remotion_component_extraction_failed')));
  });
}
