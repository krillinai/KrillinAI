import type {
  OpenCreatorUiSettingsResponse,
  UpdateOpenCreatorUiSettingsRequest
} from '@opencreator/protocol';
import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import type { OpenCreatorSettingsStore } from '../settings/store.js';
import { apiError } from './errors.js';

const updateSchema = z.object({
  language: z.enum(['system', 'zh-CN', 'en-US']).optional(),
  colorMode: z.enum(['light', 'dark']).optional(),
  accentColor: z.enum([
    'neutral',
    'blue',
    'cyan',
    'purple',
    'orange',
    'red',
    'custom'
  ]).optional(),
  customAccentColor: z.string().regex(/^#[\da-f]{6}$/i).optional(),
  defaultPermission: z.enum([
    'follow-project',
    'follow-global',
    'workspace-write',
    'danger-full-access'
  ]).optional()
}).strict();

export async function registerSettingsRoutes(
  server: FastifyInstance,
  store: OpenCreatorSettingsStore
): Promise<void> {
  server.get('/settings/ui', async (): Promise<OpenCreatorUiSettingsResponse> => (
    store.readUi()
  ));

  server.patch<{ Body: unknown }>(
    '/settings/ui',
    async (request, reply) => {
      try {
        return store.updateUi(
          updateSchema.parse(request.body) as UpdateOpenCreatorUiSettingsRequest
        );
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send(apiError(
            'VALIDATION_FAILED',
            'OpenCreator UI settings are invalid'
          ));
        }
        throw error;
      }
    }
  );
}
