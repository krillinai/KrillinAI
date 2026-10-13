import type { FastifyInstance } from 'fastify';
import type { PlatformConnectionService } from '../platform-connections/service.js';
import { apiError } from './errors.js';

export async function registerPlatformConnectionRoutes(server: FastifyInstance, youtube: PlatformConnectionService, douyin?: PlatformConnectionService) {
  server.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/platform-connections/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  for (const [platform, connection] of [['youtube', youtube], ['douyin', douyin]] as const) {
    if (connection === undefined) continue;
    const path = `/platform-connections/${platform}`;
    server.get(path, () => connection.getState());
    server.post<{ Body: { profileId?: unknown } }>(`${path}/connect`, (request, reply) => {
      const profileId = request.body?.profileId;
      if (profileId !== undefined && (typeof profileId !== 'string' || !/^[a-f0-9]{24}$/.test(profileId))) {
        return reply.code(400).send(apiError('VALIDATION_FAILED', '请选择有效的浏览器账号。'));
      }
      return connection.connect(profileId as string | undefined);
    });
    server.post(`${path}/cancel`, () => connection.cancel());
    server.delete(path, () => connection.disconnect());
    server.post<{ Body: { cookies?: unknown } }>(`${path}/import`, async (request, reply) => {
      if (typeof request.body?.cookies !== 'string' || Buffer.byteLength(request.body.cookies) > 1024 * 1024) {
        return reply.code(400).send(apiError('VALIDATION_FAILED', '请选择有效的 Cookie 文件。'));
      }
      try { return await connection.importCookies(request.body.cookies); }
      catch { return reply.code(400).send(apiError('VALIDATION_FAILED', `文件中没有有效的${platform === 'youtube' ? 'YouTube' : '抖音'}会话，请检查文件或重新连接。`)); }
    });
  }
}
