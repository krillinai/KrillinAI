import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { ZodError, z } from 'zod';
import {
  AssetError,
  createPersonalAssetRepository
} from '../assets/repository.js';
import { apiError } from './errors.js';

export async function registerPersonalAssetRoutes(
  server: FastifyInstance,
  db: Database.Database
) {
  const assets = createPersonalAssetRepository(db);
  const handle = (
    operation: () => unknown,
    reply: import('fastify').FastifyReply
  ) => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof AssetError)
        return reply
          .code(error.status)
          .send(apiError(error.code, error.message));
      if (error instanceof ZodError)
        return reply
          .code(400)
          .send(apiError('VALIDATION_FAILED', 'Invalid personal asset'));
      throw error;
    }
  };
  server.get('/assets', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { assets: assets.list() };
  });
  server.get('/assets/export', async () => assets.export());
  server.post(
    '/assets/import',
    { bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) =>
      handle(() => ({ assets: assets.import(request.body) }), reply)
  );
  server.post('/assets/migrate-subtitle-styles', async (request, reply) =>
    handle(() => ({ assets: assets.migrateStyles(request.body) }), reply)
  );
  server.post('/assets', async (request, reply) =>
    handle(() => assets.create(request.body), reply)
  );
  server.put<{ Params: { id: string } }>(
    '/assets/:id',
    async (request, reply) =>
      handle(() => {
        const body = z
          .object({ asset: z.unknown(), revision: z.number().int().positive() })
          .strict()
          .parse(request.body);
        return assets.update(request.params.id, body.asset, body.revision);
      }, reply)
  );
  server.delete<{ Params: { id: string }; Querystring: { revision?: string } }>(
    '/assets/:id',
    async (request, reply) =>
      handle(() => {
        const revision = z.coerce
          .number()
          .int()
          .positive()
          .parse(request.query.revision);
        assets.remove(request.params.id, revision);
        return { deleted: true };
      }, reply)
  );
}
