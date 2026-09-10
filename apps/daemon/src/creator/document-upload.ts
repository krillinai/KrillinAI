import type { CreatorSourceUploadResponse } from '@opencreator/protocol';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CreatorServiceError, type CreatorService } from './service.js';

export const CREATOR_DOCUMENT_UPLOAD_CONTENT_TYPE =
  'application/vnd.opencreator.creator-document';
export const CREATOR_DOCUMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export type CreatorDocumentUploadService = ReturnType<typeof createCreatorDocumentUploadService>;

export class CreatorDocumentUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'CreatorDocumentUploadError';
  }
}

export function createCreatorDocumentUploadService(input: {
  jobsRoot: string;
  creator: CreatorService;
  maxSizeBytes?: number;
}) {
  const jobsRoot = resolve(input.jobsRoot);
  const maxSizeBytes = input.maxSizeBytes ?? CREATOR_DOCUMENT_MAX_SIZE_BYTES;

  return {
    async upload(request: {
      jobId: string;
      expectedRevision: number;
      fileName: string;
      mimeType: string;
      lastModified: number | null;
      source: Readable;
    }): Promise<CreatorSourceUploadResponse> {
      const current = input.creator.getJob(request.jobId);
      if (current === undefined) {
        throw new CreatorDocumentUploadError('creator_job_not_found', 'Creator job not found', 404);
      }
      if (current.revision !== request.expectedRevision) {
        throw new CreatorDocumentUploadError(
          'creator_revision_conflict',
          'Creator job revision changed',
          409
        );
      }
      const fileName = safeFileName(request.fileName);
      const extension = safeExtension(fileName);
      const mimeType = safeMimeType(request.mimeType, extension);
      const uploadDir = join(jobsRoot, safeJobSegment(request.jobId), 'documents');
      await mkdir(uploadDir, { recursive: true, mode: 0o700 });
      const token = randomBytes(12).toString('hex');
      const temporaryPath = join(uploadDir, `.${token}.upload`);
      const finalPath = join(uploadDir, `document-${token}${extension}`);
      const hash = createHash('sha256');
      let size = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > maxSizeBytes) {
            callback(new CreatorDocumentUploadError(
              'creator_document_too_large',
              `Document exceeds the ${maxSizeBytes} byte limit`,
              413
            ));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        }
      });

      try {
        await pipeline(
          request.source,
          meter,
          createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 })
        );
        if (size === 0) {
          throw new CreatorDocumentUploadError(
            'creator_document_empty',
            'Document must not be empty',
            400
          );
        }
        await rename(temporaryPath, finalPath);
        try {
          const response = input.creator.registerSourceDocument(request.jobId, {
            expectedRevision: request.expectedRevision,
            path: finalPath,
            fileName,
            mimeType,
            size,
            sha256: hash.digest('hex'),
            lastModified: request.lastModified
          });
          if (response.deduplicated) await rm(finalPath, { force: true });
          return response;
        } catch (error) {
          await rm(finalPath, { force: true }).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        if (error instanceof CreatorDocumentUploadError || error instanceof CreatorServiceError) {
          throw error;
        }
        throw new CreatorDocumentUploadError(
          'creator_document_upload_failed',
          error instanceof Error ? error.message : 'Document upload failed',
          500
        );
      }
    }
  };
}

function safeJobSegment(value: string): string {
  if (!/^creator_job_[A-Za-z0-9_-]+$/.test(value)) {
    throw new CreatorDocumentUploadError('creator_job_not_found', 'Creator job not found', 404);
  }
  return value;
}

function safeFileName(value: string): string {
  const safe = basename(value.replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!safe) {
    throw new CreatorDocumentUploadError(
      'creator_document_invalid',
      'Document file name is invalid',
      400
    );
  }
  return safe.slice(0, 255);
}

function safeExtension(fileName: string): '.pdf' | '.txt' | '.md' | '.markdown' | '.html' | '.htm' {
  const extension = extname(fileName).toLowerCase();
  if (['.pdf', '.txt', '.md', '.markdown', '.html', '.htm'].includes(extension)) {
    return extension as '.pdf' | '.txt' | '.md' | '.markdown' | '.html' | '.htm';
  }
  throw new CreatorDocumentUploadError(
    'creator_document_type_unsupported',
    `Document type is not supported: ${extension || 'unknown'}`,
    415
  );
}

function safeMimeType(value: string, extension: string): string {
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const allowed = new Set([
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/html',
    'application/octet-stream',
    ''
  ]);
  if (!allowed.has(mimeType)) {
    throw new CreatorDocumentUploadError(
      'creator_document_type_unsupported',
      `Document MIME type is not supported: ${mimeType}`,
      415
    );
  }
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.html' || extension === '.htm') return 'text/html';
  if (extension === '.md' || extension === '.markdown') return 'text/markdown';
  return 'text/plain';
}
