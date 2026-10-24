import { describe, expect, it, vi } from 'vitest';
import { downloadGoModules } from '../../../scripts/download-go-modules.mjs';

function downloadError(stderr) {
  return Object.assign(new Error('go mod download failed'), { status: 1, stderr });
}

function fixture(execute) {
  return { cwd: '/source/krillinai', env: { GOPROXY: 'https://proxy.golang.org' }, execute, wait: vi.fn(), report: vi.fn() };
}

describe('Go module downloads', () => {
  it('recovers from the observed proxy timeout without retrying compilation', () => {
    const error = downloadError('go: github.com/aliyun/alibaba-cloud-sdk-go@v1.63.72: Get "https://proxy.golang.org/github.com/aliyun/alibaba-cloud-sdk-go/@v/v1.63.72.mod": read tcp 192.168.64.2:49237->142.251.179.141:443: read: operation timed out\n');
    const execute = vi.fn().mockImplementationOnce(() => { throw error; }).mockReturnValue('');
    const options = fixture(execute);

    downloadGoModules(options);

    expect(execute).toHaveBeenCalledTimes(2);
    for (const [command, args, settings] of execute.mock.calls) {
      expect(command).toBe('go');
      expect(args).toEqual(['mod', 'download']);
      expect(settings).toMatchObject({ cwd: options.cwd, env: options.env });
    }
    expect(options.wait).toHaveBeenCalledExactlyOnceWith(1_000);
    expect(options.report).toHaveBeenCalledWith(error.stderr);
  });

  it('stops after three failed downloads and preserves the final error', () => {
    const error = downloadError('Get "https://proxy.golang.org/example": i/o timeout');
    const options = fixture(vi.fn(() => { throw error; }));

    expect(() => downloadGoModules(options)).toThrow(error);
    expect(options.execute).toHaveBeenCalledTimes(3);
    expect(options.wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it.each([
    'TLS handshake timeout',
    'connection reset by peer',
    'unexpected EOF',
    '429 Too Many Requests',
    '502 Bad Gateway',
    '503 Service Unavailable'
  ])('retries transient download errors: %s', message => {
    const execute = vi.fn().mockImplementationOnce(() => { throw downloadError(message); }).mockReturnValue('');
    const options = fixture(execute);
    downloadGoModules(options);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    'checksum mismatch\nSECURITY ERROR\noperation timed out',
    'unknown revision v1.2.3',
    'invalid version: example',
    '404 Not Found\noperation timed out',
    '403 Forbidden',
    'go executable not found'
  ])('fails immediately for permanent errors: %s', message => {
    const error = downloadError(message);
    const options = fixture(vi.fn(() => { throw error; }));
    expect(() => downloadGoModules(options)).toThrow(error);
    expect(options.execute).toHaveBeenCalledTimes(1);
    expect(options.wait).not.toHaveBeenCalled();
  });
});
