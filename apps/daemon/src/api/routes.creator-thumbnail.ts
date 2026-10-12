import type { CreatorServicesConfig } from '@opencreator/protocol';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { downloadThumbnail } from '../creator/cover/executor.js';
import type { CreatorService } from '../creator/service.js';
import { apiError } from './errors.js';

export async function registerCreatorThumbnailRoutes(
  server: FastifyInstance,
  service: Pick<CreatorService, 'getJob'>,
  readServicesConfig?: () => Promise<CreatorServicesConfig>
): Promise<void> {
  server.get('/creator/jobs/:id/artifacts/:artifactId/thumbnail', async (request, reply) => {
    const { id, artifactId } = request.params as { id: string; artifactId: string };
    const job = service.getJob(id);
    if (job === undefined) return reply.code(404).send(apiError('creator_job_not_found', 'Creator job not found'));
    const probe = job.artifacts.find(artifact => artifact.id === artifactId
      && artifact.kind === 'download_probe' && artifact.status === 'completed');
    const url = probe?.metadata.thumbnailUrl;
    if (typeof url !== 'string' || !url.trim()) {
      return reply.code(404).send(apiError('creator_artifact_not_found', 'Video thumbnail not found'));
    }
    try {
      const config = await readServicesConfig?.();
      const thumbnail = await downloadThumbnail(url, config?.proxy ?? '', AbortSignal.timeout(30_000));
      const image = sharp(thumbnail.content);
      const metadata = await image.metadata();
      const content = metadata.format === 'jpeg' ? thumbnail.content
        : await image.rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer();
      return reply.type('image/jpeg')
        .header('Content-Disposition', 'attachment; filename="thumbnail.jpg"')
        .header('Cache-Control', 'private, no-store')
        .send(content);
    } catch {
      return reply.code(502).send(apiError('VIDEO_METADATA_UNAVAILABLE', 'Could not download the video thumbnail. Try again.'));
    }
  });
}
