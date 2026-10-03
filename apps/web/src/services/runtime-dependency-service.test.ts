import { describe, expect, it, vi } from 'vitest';
import { createRuntimeDependencyService } from './runtime-dependency-service.js';

describe('runtime dependency service', () => {
  it('passes the requested component to the shared Runtime endpoint', async () => {
    const client = { get: vi.fn(), post: vi.fn(async () => ({})) };
    const service = createRuntimeDependencyService(client);

    await service.downloadComponents('whisperkit');
    await service.downloadComponents('whisper.cpp');
    await service.downloadComponents();

    expect(client.post).toHaveBeenNthCalledWith(1, '/creator/components/download', { componentId: 'whisperkit' });
    expect(client.post).toHaveBeenNthCalledWith(2, '/creator/components/download', { componentId: 'whisper.cpp' });
    expect(client.post).toHaveBeenNthCalledWith(3, '/creator/components/download', undefined);
  });

  it('uses the shared Runtime dependency endpoints', async () => {
    const client = {
      get: vi.fn(async () => ({ ytDlp: {} })),
      post: vi.fn(async () => ({ ytDlp: {} }))
    };
    const service = createRuntimeDependencyService(client);

    await service.getYtDlpStatus();
    await service.checkYtDlpUpdate(false);
    await service.updateYtDlp();

    expect(client.get).toHaveBeenCalledWith('/creator/yt-dlp/status');
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      '/creator/yt-dlp/check',
      { force: false }
    );
    expect(client.post).toHaveBeenNthCalledWith(2, '/creator/yt-dlp/update');
  });
});
