import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function sha256CreatorFile(path: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path, { signal })) digest.update(chunk);
  return digest.digest('hex');
}
