import { describe, expect, it } from 'vitest';
import { publicFactsFromFailure, publicFactsFromHttpResponse } from '../../src/creator/public-error-facts.js';
import { creatorServiceErrorInfo, creatorServiceFailureFacts } from '../../src/creator-services/upstream-fetch.js';
import { CreatorExecutorError } from '../../src/creator/executor.js';

describe('public error facts', () => {
  it('keeps the filesystem code through wrapped artifact collection failures', () => {
    const bottom = Object.assign(new Error('File size (4014655674) is greater than 2 GiB'), { code: 'ERR_FS_FILE_TOO_LARGE' });
    expect(publicFactsFromFailure(new Error('Output collection failed', { cause: bottom }))).toEqual({
      kind: 'storage', upstreamCode: 'ERR_FS_FILE_TOO_LARGE'
    });
  });
  it('classifies only known network codes through nested causes', () => {
    const error = new Error('Authorization: Bearer secret', {
      cause: Object.assign(new Error('private endpoint'), { code: 'ENOTFOUND' })
    });
    expect(publicFactsFromFailure(error, 'openai')).toEqual({
      kind: 'dns', provider: 'openai', upstreamCode: 'ENOTFOUND'
    });
    expect(JSON.stringify(publicFactsFromFailure(error, 'openai'))).not.toContain('secret');
  });

  it('preserves validated facts from a wrapped failure and leaves unknown failures unconfirmed', () => {
    const cause = Object.assign(new Error('private response'), {
      publicFacts: { kind: 'rate-limited', provider: 'openai', httpStatus: 429, upstreamCode: 'quota_exceeded' }
    });
    expect(publicFactsFromFailure(new Error('wrapped', { cause }))).toEqual(cause.publicFacts);
    expect(publicFactsFromFailure(Object.assign(new Error('secret'), { code: 'PRIVATE_TOKEN' })))
      .toEqual({ kind: 'unknown' });
    expect(publicFactsFromFailure(Object.assign(new Error('private'), { code: 'krillin_auth_failed' })))
      .toEqual({ kind: 'unauthorized' });
  });

  it('uses HTTP status and safe upstream code as separate facts', () => {
    expect(publicFactsFromHttpResponse(403, 'gemini', 'PERMISSION_DENIED')).toEqual({
      kind: 'unauthorized', provider: 'gemini', upstreamCode: 'PERMISSION_DENIED', httpStatus: 403
    });
  });

  it('sanitizes explanations without discarding otherwise valid provider facts', () => {
    const cause = Object.assign(new Error('Rejected. Bearer private-token'), {
      publicFacts: { kind: 'http-rejected', provider: 'seedance', httpStatus: 400,
        upstreamCode: 'INVALID_IMAGE', upstreamMessage: 'Invalid reference. token=private' }
    });
    const wrapped = CreatorExecutorError.from('creator_video_upstream_error', cause);
    expect(wrapped.message).toBe('Rejected. [redacted]');
    expect(wrapped.publicFacts).toEqual({ kind: 'http-rejected', provider: 'seedance', httpStatus: 400,
      upstreamCode: 'INVALID_IMAGE', upstreamMessage: 'Invalid reference. [redacted]' });
    expect(JSON.stringify(wrapped)).not.toContain('private');
  });

  it('preserves the provider reason, long code and request ID across executor wrapping', async () => {
    const code = 'InputImageSensitiveContentDetected.SensitiveContent';
    const info = await creatorServiceErrorInfo(new Response(JSON.stringify({
      error: { code, message: 'Reference image was rejected. api_key=private', request_id: 'request-body-123' }
    }), { status: 400, headers: { 'x-request-id': 'request-header-123' } }), 'Video generation', 'seedance');
    expect(info.publicFacts).toEqual({
      kind: 'http-rejected', provider: 'seedance', httpStatus: 400, upstreamCode: code,
      upstreamMessage: 'Reference image was rejected. [redacted]', requestId: 'request-body-123'
    });
    const cause = Object.assign(new Error(info.message), { publicFacts: info.publicFacts });
    const wrapped = CreatorExecutorError.from('creator_video_upstream_error', cause);
    expect(wrapped.cause).toBe(cause);
    expect(publicFactsFromFailure(wrapped)).toEqual(info.publicFacts);
    expect(JSON.stringify(info)).not.toContain('private');
  });

  it('keeps HTTP and request ID facts when the response body is not JSON', async () => {
    const info = await creatorServiceErrorInfo(new Response('<html>private gateway</html>', {
      status: 502, headers: { 'x-tt-logid': 'request-log-123' }
    }), 'Video generation', 'seedance');
    expect(info.publicFacts).toEqual({ kind: 'unavailable', provider: 'seedance', httpStatus: 502, requestId: 'request-log-123' });
    expect(JSON.stringify(info)).not.toContain('private');
  });

  it('supports numeric and nested provider errors without inventing an HTTP failure for asynchronous jobs', () => {
    expect(creatorServiceFailureFacts({ error: { code: 3, message: 'Invalid duration' } }, 'veo')).toEqual({
      kind: 'provider-failed', provider: 'veo', upstreamCode: '3', upstreamMessage: 'Invalid duration'
    });
    expect(creatorServiceFailureFacts({ data: { error: { code: 'INVALID_IMAGE', message: 'Invalid reference' } } }, 'kling')).toEqual({
      kind: 'provider-failed', provider: 'kling', upstreamCode: 'INVALID_IMAGE', upstreamMessage: 'Invalid reference'
    });
    expect(creatorServiceFailureFacts({ code: 0, message: 'SUCCEED', data: { task_status: 'failed', task_status_msg: 'Reference rejected' } }, 'kling')).toEqual({
      kind: 'provider-failed', provider: 'kling', upstreamMessage: 'Reference rejected'
    });
    expect(creatorServiceFailureFacts({ error: 'Reference rejected' }, 'seedance', { httpStatus: 400 })).toEqual({
      kind: 'http-rejected', provider: 'seedance', httpStatus: 400, upstreamMessage: 'Reference rejected'
    });
  });

  it('falls back to a safe header request ID when the body request ID is invalid', async () => {
    const info = await creatorServiceErrorInfo(new Response(JSON.stringify({ error: { code: 'INVALID_IMAGE', request_id: 'sk-private-key' } }), {
      status: 400, headers: { 'x-request-id': 'header-request-123' }
    }), 'Video generation', 'seedance');
    expect(info.publicFacts.requestId).toBe('header-request-123');
    expect(JSON.stringify(info)).not.toContain('private');
  });

  it('rejects token-like upstream codes and arbitrary provider messages', async () => {
    const response = new Response(JSON.stringify({
      error: { code: 'sk-private-long-secret-value-that-must-not-leak', message: 'Bearer private' }
    }), { status: 403 });
    const info = await creatorServiceErrorInfo(response, 'Image generation', 'openai');
    expect(info.publicFacts).toEqual({ kind: 'unauthorized', provider: 'openai', httpStatus: 403 });
    expect(JSON.stringify(info)).not.toContain('private');
  });
});
