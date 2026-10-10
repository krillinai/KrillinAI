import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemotionComponentManager, type RemotionComponentManager } from '../../src/creator/stickman/remotion-component.js';

const roots: string[] = [];
const managers: RemotionComponentManager[] = [];
const servers: Server[] = [];
afterEach(async () => {
  for (const manager of managers.splice(0)) manager.close();
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const hash = (contents: Buffer | string) => createHash('sha256').update(contents).digest('hex');

async function fixture(options: { network?: boolean; link?: boolean; wrongPlatform?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'remotion-component-'));
  roots.push(root);
  const source = join(root, 'source');
  await mkdir(join(source, 'bundle'), { recursive: true });
  const files = [
    { path: 'bundle/index.html', kind: 'bundle', contents: '<html></html>' },
    { path: 'browser', kind: 'browser', contents: '#!/bin/sh\necho Chromium\n' },
    { path: 'renderer.js', kind: 'renderer', contents: 'exports.renderMedia = () => {};\n' }
  ];
  for (const file of files) await writeFile(join(source, file.path), file.contents);
  await chmod(join(source, 'browser'), 0o755);
  if (options.link) await symlink(join(root, 'outside'), join(source, 'escape'));
  const manifest = { version: 1, platform: process.platform, arch: process.arch,
    remotionVersion: '4.0.473', chromiumVersion: '149.0.7790.0', bundlePath: 'bundle', browserExecutable: 'browser', rendererEntry: 'renderer.js',
    resources: files.map(file => ({ path: file.path, kind: file.kind, sha256: hash(file.contents), bytes: Buffer.byteLength(file.contents), version: '1', platform: process.platform, arch: process.arch })) };
  await writeFile(join(source, 'manifest.json'), JSON.stringify(manifest));
  const archive = join(root, `Remotion-1.0.0-${process.platform}-${process.arch}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', source, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  let requests = 0;
  let archiveUrl = 'https://example.test/remotion.tar.gz';
  if (options.network) {
    const contents = await readFile(archive);
    const server = createServer((_request, response) => {
      requests += 1;
      response.writeHead(200, { 'Content-Length': contents.length });
      response.write(contents.subarray(0, Math.floor(contents.length / 2)));
      setTimeout(() => response.end(contents.subarray(Math.floor(contents.length / 2))), 100);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected server address');
    archiveUrl = `http://127.0.0.1:${address.port}/component`;
  }
  const releasePath = join(root, 'release.json');
  const release = { version: 1, id: 'remotion', componentVersion: '1.0.0', remotionVersion: manifest.remotionVersion,
    chromiumVersion: manifest.chromiumVersion, platform: options.wrongPlatform ? 'invalid' : process.platform, arch: process.arch,
    archiveUrl, archiveSha256: hash(await readFile(archive)), manifestSha256: hash(await readFile(join(source, 'manifest.json'))),
    bytes: (await readFile(archive)).length, fileName: archive.split('/').at(-1) };
  await writeFile(releasePath, JSON.stringify(release));
  const cache = join(root, 'cache');
  const manager = createRemotionComponentManager({ root: cache, releasePath, archivePath: options.network ? undefined : archive, readProxy: async () => '' });
  managers.push(manager);
  return { root, source, archive, releasePath, release, cache, manager, requests: () => requests };
}

describe('managed Remotion component', () => {
  it('does not install or download while reading component status', async () => {
    const test = await fixture({ network: true });
    expect(await test.manager.status()).toMatchObject({ id: 'remotion', available: true, state: 'not_installed', version: null, model: null, models: [] });
    expect(test.requests()).toBe(0);
    await expect(readFile(join(test.cache, test.release.manifestSha256, 'manifest.json'))).rejects.toThrow();
  });

  it('shares manual downloads and render tasks, preserves progress, and reuses verified resources', async () => {
    const test = await fixture({ network: true });
    const listener = vi.fn();
    await test.manager.download();
    const runtime = await test.manager.ensure({ signal: new AbortController().signal, reportProgress: listener });
    expect(test.requests()).toBe(1);
    expect(runtime.rendererEntry).toBe(join(runtime.root, 'renderer.js'));
    expect(await test.manager.status()).toMatchObject({ state: 'ready', version: '4.0.473', percent: 100 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'preparing_dependencies' }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'dependencies_ready' }));
    await test.manager.download();
    await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    expect(test.requests()).toBe(1);
  });

  it('fails a corrupted archive and supports retry without losing existing work', async () => {
    const test = await fixture();
    const original = await readFile(test.archive);
    await writeFile(test.archive, 'corrupted');
    await expect(test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} })).rejects.toThrow('SHA-256 mismatch');
    expect(await test.manager.status()).toMatchObject({ state: 'failed' });
    await writeFile(test.archive, original);
    const runtime = await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    expect(await readFile(join(runtime.root, 'bundle', 'index.html'), 'utf8')).toBe('<html></html>');
  });

  it('checks installed file hashes and repairs corrupted resources', async () => {
    const test = await fixture();
    const runtime = await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    await writeFile(runtime.rendererEntry!, 'modified');
    await test.manager.download();
    await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    expect(await readFile(runtime.rendererEntry!, 'utf8')).toBe('exports.renderMedia = () => {};\n');
  });

  it('rejects symbolic links before extracting downloaded code', async () => {
    const test = await fixture({ link: true });
    await expect(test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} })).rejects.toThrow('archive_links_not_allowed');
    await expect(readFile(join(test.root, 'outside'))).rejects.toThrow();
  });

  it('rejects unavailable or mismatched release descriptors without downloading', async () => {
    const test = await fixture({ network: true, wrongPlatform: true });
    expect(await test.manager.status()).toMatchObject({ available: false, state: 'unsupported' });
    expect(test.requests()).toBe(0);
    await expect(test.manager.download()).rejects.toThrow();
  });

  it('canceling a render subscriber does not cancel the shared installation', async () => {
    const test = await fixture({ network: true });
    const canceled = new AbortController();
    const first = test.manager.ensure({ signal: canceled.signal, reportProgress() {} });
    const second = test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    canceled.abort();
    await expect(first).rejects.toMatchObject({ code: 'creator_stage_canceled' });
    await second;
    expect(test.requests()).toBe(1);
    expect(await test.manager.status()).toMatchObject({ state: 'ready' });
  });

  it('keeps prior component versions intact while installing a compatible new version', async () => {
    const test = await fixture();
    const old = await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    await writeFile(join(test.source, 'manifest.json'), `${await readFile(join(test.source, 'manifest.json'), 'utf8')}\n`);
    execFileSync('tar', ['-czf', test.archive, '-C', test.source, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const updatedRelease = { ...test.release, manifestSha256: hash(await readFile(join(test.source, 'manifest.json'))), archiveSha256: hash(await readFile(test.archive)), bytes: (await readFile(test.archive)).length };
    await writeFile(test.releasePath, JSON.stringify(updatedRelease));
    await test.manager.download();
    const runtime = await test.manager.ensure({ signal: new AbortController().signal, reportProgress() {} });
    expect(runtime.root).not.toBe(old.root);
    expect(await readFile(join(old.root, 'manifest.json'), 'utf8')).not.toMatch(/\n$/);
  });
});
