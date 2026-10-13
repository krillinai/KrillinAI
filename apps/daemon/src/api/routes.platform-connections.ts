import type { FastifyInstance } from 'fastify';
import type { YouTubeConnectionService } from '../platform-connections/youtube.js';
import { apiError } from './errors.js';

export async function registerPlatformConnectionRoutes(server: FastifyInstance, youtube: YouTubeConnectionService) {
  server.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/platform-connections/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  server.get('/platform-connections/youtube', () => youtube.getState());
  server.post<{ Body: { profileId?: unknown } }>('/platform-connections/youtube/connect', (request, reply) => {
    const profileId = request.body?.profileId;
    if (profileId !== undefined && (typeof profileId !== 'string' || !/^[a-f0-9]{24}$/.test(profileId))) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', '请选择有效的浏览器账号。'));
    }
    return youtube.connect(profileId as string | undefined);
  });
  server.post('/platform-connections/youtube/complete-login', () => youtube.completeLogin());
  server.post('/platform-connections/youtube/cancel', () => youtube.cancel());
  server.delete('/platform-connections/youtube', () => youtube.disconnect());
  server.post<{ Body: { cookies?: unknown } }>('/platform-connections/youtube/import', async (request, reply) => {
    if (typeof request.body?.cookies !== 'string' || Buffer.byteLength(request.body.cookies) > 1024 * 1024) {
      return reply.code(400).send(apiError('VALIDATION_FAILED', '请选择有效的 Cookie 文件。'));
    }
    try { return await youtube.importCookies(request.body.cookies); }
    catch { return reply.code(400).send(apiError('VALIDATION_FAILED', '文件中没有有效的 YouTube 登录态，请检查文件或重新连接。')); }
  });
}
