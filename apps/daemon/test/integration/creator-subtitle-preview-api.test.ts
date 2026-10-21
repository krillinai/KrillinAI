import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerCreatorRoutes } from '../../src/api/routes.creator.js';
import type { CreatorSubtitleRenderRequest } from '@opencreator/protocol';

describe('subtitle preview API', () => {
  it('compiles full timelines and exposes only manifest font IDs', async () => {
    const server = Fastify();
    const compile = vi.fn(async (_input: CreatorSubtitleRenderRequest) => ({ schemaVersion: 1 as const, ass: 'ASS', fonts: [], width: 640, height: 360, contentHash: 'hash' }));
    const font = vi.fn(async (id: string) => id === 'a'.repeat(64) ? Buffer.from('font-data') : undefined);
    await registerCreatorRoutes(server, {} as never, {} as never, {
      jobsRoot: '/unused', dispatcher: {} as never, subtitleRenderService: { compile, font }
    });
    const input = { width: 640, height: 360, horizontal: true, bilingual: true, subtitlePosition: 'top', subtitleStyle: {},
      cues: [{ startMs: 0, endMs: 1000, text: '保留标点！\n手动换行', sourceText: 'Long original '.repeat(30) }, { startMs: 500, endMs: 1500, text: 'Overlap' }] };
    try {
      expect((await server.inject({ method: 'POST', url: '/creator/subtitle-render/prepare', payload: input })).statusCode).toBe(200);
      expect(compile.mock.calls[0]?.[0]).toMatchObject(input);
      for (const invalid of [{ ...input, width: 1 }, { ...input, cues: [{ startMs: 1000, endMs: 1000, text: 'bad' }] }, { ...input, subtitleStyle: { rawAssStyle: 'arbitrary' } }]) {
        expect((await server.inject({ method: 'POST', url: '/creator/subtitle-render/prepare', payload: invalid })).statusCode).toBe(400);
      }
      expect(compile).toHaveBeenCalledOnce();
      const response = await server.inject({ method: 'GET', url: `/creator/subtitle-render/fonts/${'a'.repeat(64)}` });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('font/ttf');
      expect(response.body).toBe('font-data');
      expect((await server.inject({ method: 'GET', url: '/creator/subtitle-render/fonts/unknown' })).statusCode).toBe(404);
    } finally { await server.close(); }
  });
  it('validates preview options and returns rendered PNG data without creating a job', async () => {
    const server = Fastify();
    const render = vi.fn(async () => Buffer.from('png-data'));
    await registerCreatorRoutes(server, {} as never, {} as never, {
      jobsRoot: '/unused', dispatcher: {} as never, subtitlePreviewService: { render }
    });
    const input = {
      width: 960, height: 540, bilingual: true, subtitlePosition: 'bottom',
      translationText: 'Translation', originalText: 'Source', subtitleStyle: { fontPreset: 'rounded' }
    };
    const url = (options: unknown) => `/creator/subtitle-preview?${new URLSearchParams({ options: JSON.stringify(options) })}`;
    try {
      const result = await server.inject({ method: 'GET', url: url(input) });
      expect(result.statusCode).toBe(200);
      expect(result.headers['content-type']).toContain('image/png');
      expect(result.body).toBe('png-data');
      expect(render).toHaveBeenCalledWith(expect.objectContaining({ ...input, subtitleStyle: expect.objectContaining(input.subtitleStyle) }), expect.any(AbortSignal));
      for (const invalid of [{ ...input, width: 9000 }, { ...input, translationText: '{\\rMinor}' }, { ...input, subtitleStyle: { rawAssStyle: 'arbitrary' } }]) {
        expect((await server.inject({ method: 'GET', url: url(invalid) })).statusCode).toBe(400);
      }
      expect(render).toHaveBeenCalledOnce();
    } finally { await server.close(); }
  });
});
