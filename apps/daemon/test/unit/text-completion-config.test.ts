import { describe, expect, it } from 'vitest';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { creatorTextCompletionConfig } from '../../src/creator-services/text-completion-config.js';

describe('creator text completion config', () => {
  it('uses shared Muse Spark credentials for plain creator text completions without JSON or tools mode', () => {
    const config = createDefaultCreatorServicesConfig();
    config.llm.source = 'custom';
    config.muse2api.sparkEnabled = true;
    config.llm.jsonMode = true;
    config.muse2api.baseUrl = 'http://muse-gateway:18610/v1';
    config.muse2api.apiKey = 'secret';

    expect(creatorTextCompletionConfig(config)).toEqual({
      baseUrl: 'http://muse-gateway:18610/v1',
      apiKey: 'secret',
      model: 'muse-spark',
      jsonMode: false
    });
  });

  it('preserves the existing LLM provider configuration for non-Muse sources', () => {
    const config = createDefaultCreatorServicesConfig();
    config.llm.source = 'custom';
    config.llm.baseUrl = 'https://example.test/v1';
    config.llm.apiKey = 'custom-key';
    expect(creatorTextCompletionConfig(config)).toMatchObject(config.llm);
  });
});
