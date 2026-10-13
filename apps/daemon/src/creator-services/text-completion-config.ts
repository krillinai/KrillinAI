import type { CreatorServicesConfig, OpenAiCompatibleConfig } from '@opencreator/protocol';

/** Resolves only plain creator text tasks; Agent/MCP transports stay independent. */
export function creatorTextCompletionConfig(config: CreatorServicesConfig): OpenAiCompatibleConfig & {
  jsonMode: boolean;
} {
  if (config.muse2api.sparkEnabled) {
    return {
      baseUrl: config.muse2api.baseUrl,
      apiKey: config.muse2api.apiKey,
      model: 'muse-spark',
      jsonMode: false
    };
  }
  return config.llm;
}
