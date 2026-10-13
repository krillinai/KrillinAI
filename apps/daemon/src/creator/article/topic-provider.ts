import type { CreatorServicesConfig, OpenAiCompatibleConfig } from '@opencreator/protocol';
import { creatorTextCompletionConfig } from '../../creator-services/text-completion-config.js';

export type ArticleTopicResponseFormat = CreatorServicesConfig['articleWriter']['topicResponseFormat'];

export type ArticleTopicProviderResolution =
  | {
      ok: true;
      provider: OpenAiCompatibleConfig & { jsonMode: boolean };
      responseFormat?: Record<string, unknown>;
      responseFormatName?: 'Strict JSON Schema' | 'JSON object';
    }
  | {
      ok: false;
      reason: 'invalid-selection' | 'custom-provider-unavailable' | 'custom-provider-incomplete' | 'response-format-unconfigured';
      message: string;
    };

export function resolveArticleTopicProvider(
  config: CreatorServicesConfig,
  count?: number
): ArticleTopicProviderResolution {
  if (config.articleWriter.topicProvider === 'inherit') {
    return { ok: true, provider: creatorTextCompletionConfig(config) };
  }
  if (config.articleWriter.topicProvider !== 'custom') {
    return {
      ok: false,
      reason: 'invalid-selection',
      message: 'The Article Writer topic provider selection is invalid.'
    };
  }
  if (config.llm.source !== 'custom') {
    return {
      ok: false,
      reason: 'custom-provider-unavailable',
      message: 'Select and configure a custom LLM in AI Services before using it for Article Writer topics.'
    };
  }
  if (!config.llm.baseUrl.trim() || !config.llm.model.trim() || !config.llm.apiKey.trim()) {
    return {
      ok: false,
      reason: 'custom-provider-incomplete',
      message: 'The configured custom LLM requires a Base URL, model, and API Key.'
    };
  }

  if (config.articleWriter.topicResponseFormat === 'json_schema') {
    return {
      ok: true,
      provider: config.llm,
      responseFormat: articleTopicsJsonSchema(count),
      responseFormatName: 'Strict JSON Schema'
    };
  }
  if (config.articleWriter.topicResponseFormat === 'json_object') {
    return {
      ok: true,
      provider: config.llm,
      responseFormat: { type: 'json_object' },
      responseFormatName: 'JSON object'
    };
  }
  return {
    ok: false,
    reason: 'response-format-unconfigured',
    message: 'Choose a structured response format supported by the configured custom LLM.'
  };
}

function articleTopicsJsonSchema(count?: number): Record<string, unknown> {
  const topics: Record<string, unknown> = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        angle: { type: 'string' },
        summary: { type: 'string' }
      },
      required: ['title', 'angle', 'summary'],
      additionalProperties: false
    }
  };
  if (count !== undefined) {
    topics.minItems = count;
    topics.maxItems = count;
  }
  return {
    type: 'json_schema',
    json_schema: {
      name: 'article_topics',
      strict: true,
      schema: {
        type: 'object',
        properties: { topics },
        required: ['topics'],
        additionalProperties: false
      }
    }
  };
}
