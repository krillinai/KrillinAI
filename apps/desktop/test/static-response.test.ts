import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { staticResponse } from '../src/main/protocol-handler.js';

let root = '';

afterEach(() => {
  if (root.length > 0) rmSync(root, { recursive: true, force: true });
  root = '';
});

describe('Desktop static response', () => {
  it('uses index.html for an extensionless workspace route', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'index.html'), '<main>workspace</main>');

    const response = await staticResponse(root, request('/thread/abc'), true);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('workspace');
  });

  it('returns 404 for missing scripts, styles, images, and wasm', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'index.html'), '<main>workspace</main>');

    for (const path of [
      '/assets/missing.js',
      '/assets/missing.css',
      '/assets/missing.png',
      '/assets/missing.wasm'
    ]) {
      expect((await staticResponse(root, request(path), true)).status, path).toBe(404);
    }
  });

  it('serves an existing asset with its real MIME type', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'assets', 'app.js'), 'export {}');

    const response = await staticResponse(root, request('/assets/app.js'), true);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await response.text()).toBe('export {}');
  });

  it('allows blob reads needed to inline local preview resources', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'index.html'), '<main>workspace</main>');

    const response = await staticResponse(root, request('/'), true);

    expect(response.headers.get('content-security-policy'))
      .toContain("connect-src 'self' blob:");
  });

  it('allows the supported video preview sources', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'index.html'), '<main>workspace</main>');

    const response = await staticResponse(root, request('/'), true);
    const policy = response.headers.get('content-security-policy');

    expect(policy).toContain("img-src 'self' data: blob: https://i.ytimg.com");
    expect(policy).toContain("media-src 'self' blob: https: http:");
    expect(policy).toContain(
      'frame-src https://www.youtube-nocookie.com https://player.bilibili.com'
    );
  });

  it('serves MP4 assets with media headers and byte ranges', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    mkdirSync(join(root, 'creator-presets'));
    writeFileSync(join(root, 'creator-presets', 'preview.mp4'), '0123456789');

    const response = await staticResponse(
      root,
      request('/creator-presets/preview.mp4', { headers: { Range: 'bytes=2-5' } }),
      true
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('2345');
  });

  it('supports HEAD and suffix ranges without reading the whole media file', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'preview.mp4'), '0123456789');

    const head = await staticResponse(root, request('/preview.mp4', { method: 'HEAD' }), true);
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');

    const suffix = await staticResponse(
      root,
      request('/preview.mp4', { headers: { Range: 'bytes=-3' } }),
      true
    );
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(await suffix.text()).toBe('789');
  });

  it('rejects invalid media ranges', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-static-'));
    writeFileSync(join(root, 'preview.mp4'), '0123456789');

    const response = await staticResponse(
      root,
      request('/preview.mp4', { headers: { Range: 'bytes=20-' } }),
      true
    );

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
  });
});

function request(path: string, init?: RequestInit): Request {
  return new Request(`opencreator-app://app${path}`, init);
}
