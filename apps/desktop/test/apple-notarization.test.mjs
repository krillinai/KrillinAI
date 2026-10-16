import { describe, expect, it, vi } from 'vitest';
import { runStapler, submitAndWaitForNotarization } from '../scripts/apple-notarization.mjs';

describe('Apple notarization tickets', () => {
  const connectionLost = {
    status: 68,
    stdout: 'Processing: /tmp/OpenCreator.app',
    stderr: 'Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."'
  };

  it.each(['staple', 'validate'])('retries a transient network failure during %s', async action => {
    const run = vi.fn()
      .mockReturnValueOnce(connectionLost)
      .mockReturnValue({ status: 0, stdout: 'The action worked!' });
    const delay = vi.fn();
    await runStapler(action, '/tmp/OpenCreator.app', { run, delay, logger: vi.fn() });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('xcrun', [
      'stapler', action, '/tmp/OpenCreator.app'
    ], expect.objectContaining({ timeout: 120_000 }));
    expect(delay).toHaveBeenCalledExactlyOnceWith(15_000);
  });

  it('stops after bounded retries and retains the final diagnostic', async () => {
    const run = vi.fn().mockReturnValue(connectionLost);
    const delay = vi.fn();
    await expect(runStapler('staple', '/tmp/OpenCreator.dmg', {
      run, delay, logger: vi.fn()
    })).rejects.toThrow(/exit 68:[\s\S]*Processing:[\s\S]*network connection was lost/);
    expect(run).toHaveBeenCalledTimes(5);
    expect(delay.mock.calls).toEqual([[15_000], [30_000], [60_000], [60_000]]);
  });

  it.each([
    { status: 65, stdout: 'The validate action failed! Error 65. No ticket found.' },
    { status: 68, stderr: 'Could not validate ticket. The staple and validate action failed! Error 68.' },
    { status: 1, stderr: 'Error Domain=NSURLErrorDomain Code=-1202 "Certificate is untrusted."' },
    { status: null, error: Object.assign(new Error('xcrun missing'), { code: 'ENOENT' }) }
  ])('fails immediately for a permanent validation or tooling error: %j', async result => {
    const run = vi.fn().mockReturnValue(result);
    const delay = vi.fn();
    await expect(runStapler('validate', '/tmp/OpenCreator.app', {
      run, delay, logger: vi.fn()
    })).rejects.toThrow();
    expect(run).toHaveBeenCalledOnce();
    expect(delay).not.toHaveBeenCalled();
  });

  it('retries an actual command timeout without accepting a partial result', async () => {
    const run = vi.fn()
      .mockReturnValueOnce({ status: null, error: Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' }) })
      .mockReturnValue({ status: 0 });
    const delay = vi.fn();
    await runStapler('validate', '/tmp/OpenCreator.app', { run, delay, logger: vi.fn() });
    expect(run).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledOnce();
  });
});

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
