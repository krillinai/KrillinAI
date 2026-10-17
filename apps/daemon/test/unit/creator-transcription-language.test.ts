import { describe, expect, it } from 'vitest';
import { createDefaultCreatorServicesConfig, type GatewayModel } from '@opencreator/protocol';
import { assessKrillinTranscription, resolveKrillinTranscription } from '../../src/creator/krillin/transcription-language.js';
import { createGatewayCreatorSource } from '../../src/gateway/creator-service-source.js';

describe('actual transcription model and language capability', () => {
  it('keeps the real cpp model separate from its legacy file alias', () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisper.cpp';
    config.transcription.whisperCpp.model = 'tiny';
    expect(assessKrillinTranscription(config, 'zh-TW')).toMatchObject({
      model: 'tiny', executionModel: 'large-v2', productLanguage: 'zh_tw', backendLanguage: 'zh', support: 'supported'
    });
    expect(assessKrillinTranscription(config, 'yue').support).toBe('unsupported');
    config.transcription.whisperCpp.model = 'large-v3-turbo';
    expect(assessKrillinTranscription(config, 'yue')).toMatchObject({
      model: 'large-v3-turbo', executionModel: 'large-v3-turbo', support: 'supported'
    });
  });

  it.each([
    ['timestamped', 'segment'], ['text-only', 'none'], ['not-in-catalog', 'unknown']
  ])('uses the task-selected official model capabilities: %s', async (selected, timestamps) => {
    const config = createDefaultCreatorServicesConfig();
    const models: GatewayModel[] = [
      { id: 'timestamped', modality: 'transcription', capabilities: ['subtitle_timestamps'] },
      { id: 'text-only', modality: 'transcription', capabilities: [] }
    ];
    const source = createGatewayCreatorSource({
      account: {
        peekState: () => ({ source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@example.test', verified: true }, bindingVersion: 'a:1', models, activationError: null }),
        modelCredentials: async () => ({ accountId: 'a', modelKey: 'fixture-key', keyVersion: '1', bindingVersion: 'a:1', baseUrl: 'https://gateway.example/v1', defaults: { transcription: 'timestamped' }, models })
      },
      manual: { read: async () => config, write: async c => c, reset: async () => config },
      getLocalOrigin: () => 'http://127.0.0.1:39999'
    });
    const effective = await source.store.read();
    expect(resolveKrillinTranscription(effective, selected)).toMatchObject({
      model: selected, capability: { coverage: 'unknown', timestamps }
    });
    expect(assessKrillinTranscription(effective, 'hi', selected).support).toBe('unknown');
  });
});
