import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerCreatorRoutes } from '../../src/api/routes.creator.js';

describe('subtitle preview API', () => {
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
