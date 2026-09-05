import { describe, expect, it, vi } from 'vitest';
import { submitAndWaitForNotarization } from '../scripts/apple-notarization.mjs';

describe('Apple notarization polling', () => {
  it('waits for an accepted submission without relying on --wait output', async () => {
    const delay = vi.fn();
    const logger = vi.fn();
    const runJson = vi.fn(args => {
      if (args[0] === 'submit') return { id: 'submission-id' };
      const infoCalls = runJson.mock.calls.filter(
        ([callArgs]) => callArgs[0] === 'info'
      ).length;
      return { status: infoCalls === 1 ? 'In Progress' : 'Accepted' };
    });

    await expect(submitAndWaitForNotarization(
      '/tmp/OpenCreator.zip',
      ['--keychain-profile', 'clawee-notary'],
      { delay, logger, maxPolls: 3, pollIntervalMs: 1, runJson }
    )).resolves.toEqual({
      id: 'submission-id',
      status: 'Accepted'
    });
    expect(delay).toHaveBeenCalledOnce();
    expect(runJson.mock.calls[0][0]).not.toContain('--wait');
  });

  it('reports notarization issues for a rejected binary', async () => {
    const runJson = vi.fn(args => {
      if (args[0] === 'submit') return { id: 'submission-id' };
      if (args[0] === 'info') return { status: 'Invalid' };
      return {
        statusSummary: 'Archive contains critical validation errors',
        issues: [{
          path: 'OpenCreator.app/Contents/Resources/bin/ffmpeg',
          message: 'The binary is not signed.'
        }]
      };
    });

    await expect(submitAndWaitForNotarization(
      '/tmp/OpenCreator.zip',
      [],
      { logger: vi.fn(), runJson }
    )).rejects.toThrow(
      /Archive contains critical validation errors[\s\S]*ffmpeg[\s\S]*not signed/
    );
  });
});
