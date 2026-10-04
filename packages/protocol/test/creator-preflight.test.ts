import { describe, expect, it } from 'vitest';
import { creatorPreflightFailure, type CreatorPreflightResponse } from '../src/creator-services.js';

describe('shared preflight diagnostics', () => {
  it.each([
    ['llm', 'creator_llm_config_missing', 'configuration'],
    ['transcription-config', 'creator_transcription_config_missing', 'configuration'],
    ['reference-image-required', 'creator_stage_input_missing', 'validation'],
    ['input-file', 'creator_stage_input_missing', 'validation'],
    ['other', 'creator_preflight_blocked', 'validation']
  ])('preserves the %s blocker with an actionable reason', (id, code, kind) => {
    const result: CreatorPreflightResponse = { templateId: 'video-translation', templateVersion: 2,
      stageId: 'subtitle', executionMode: 'local', canStart: false, ready: [], warning: [],
      blocked: [{ id, title: '启动条件', message: '请配置服务或输入。 token=private', executionMode: 'local', repair: { label: '配置' } }], checkedAt: '' };
    expect(creatorPreflightFailure(result)).toMatchObject({ code, message: expect.stringContaining('请配置服务或输入'), publicFacts: { kind, upstreamMessage: expect.stringContaining('请配置服务或输入') } });
    expect(JSON.stringify(creatorPreflightFailure(result))).not.toContain('private');
  });
});
