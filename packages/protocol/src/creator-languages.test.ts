import { describe, expect, it } from 'vitest';
import { creatorLanguages, normalizeCreatorLanguage, searchCreatorLanguages, localWhisperLanguageCapability, transcriptionLanguageSupport, whisperLanguageCode, creatorTranscriptionModel } from './creator-languages.js';
import { createDefaultCreatorServicesConfig } from './creator-services.js';

describe('Creator language catalog and ASR capabilities', () => {
  it('keeps stable product codes, searchable names and 52 preferred sources', () => {
    expect(new Set(creatorLanguages.map(item => item.code)).size).toBe(creatorLanguages.length);
    expect(creatorLanguages.filter(item => item.sourcePreferred)).toHaveLength(52);
    expect(searchCreatorLanguages('印地', true).map(item => item.code)).toEqual(['hi']);
    expect(searchCreatorLanguages('हिन्दी', true).map(item => item.code)).toEqual(['hi']);
    expect(searchCreatorLanguages('pinyin', true)).toEqual([]);
    expect(normalizeCreatorLanguage('unlisted-language')).toBe('unlisted-language');
  });
  it.each([['zh-TW', 'zh_tw', 'zh'], ['zh', 'zh_cn', 'zh'], ['tl', 'fil', 'tl'], ['jw', 'jv', 'jw'], ['iw', 'he', 'he']])('maps %s at the provider boundary', (input, product, backend) => {
    expect(normalizeCreatorLanguage(input)).toBe(product);
    expect(whisperLanguageCode(input)).toBe(backend);
  });
  it('exposes 123 source candidates while preserving the actual model coverage', () => {
    const sources = searchCreatorLanguages('', true).map(language => language.code);
    const sourceCodes = new Set<string>(sources);
    expect(sources).toHaveLength(123);
    expect(sources).not.toContain('pinyin');
    for (const [model, count] of [['large-v2', 100], ['large-v3', 101]] as const) {
      const capability = localWhisperLanguageCapability(model);
      expect(sources.filter(code => transcriptionLanguageSupport(code, capability) === 'supported')).toHaveLength(count);
      expect(capability.supportedLanguages.every(code => sourceCodes.has(code))).toBe(true);
    }
    expect(transcriptionLanguageSupport('om', localWhisperLanguageCapability('large-v3'))).toBe('unsupported');
    expect(transcriptionLanguageSupport('om')).toBe('unknown');
    expect(normalizeCreatorLanguage('nn')).toBe('nn');
    expect(normalizeCreatorLanguage('nb')).toBe('no');
  });
  it('distinguishes closed, partial and unknown coverage', () => {
    expect(transcriptionLanguageSupport('hi', localWhisperLanguageCapability('large-v2'))).toBe('supported');
    expect(transcriptionLanguageSupport('yue', localWhisperLanguageCapability('large-v2'))).toBe('unsupported');
    expect(transcriptionLanguageSupport('yue', localWhisperLanguageCapability('large-v3-turbo'))).toBe('supported');
    expect(transcriptionLanguageSupport('hi', localWhisperLanguageCapability('tiny.en'))).toBe('unsupported');
    expect(transcriptionLanguageSupport('hi')).toBe('unknown');
    expect(transcriptionLanguageSupport('hi', { coverage: 'partial', supportedLanguages: ['en'], timestamps: 'segment', profileVersion: 'test' })).toBe('unknown');
    expect(transcriptionLanguageSupport('pinyin')).toBe('unsupported');
  });
  it('resolves the model actually requested by the compatibility bridge', () => {
    const config = createDefaultCreatorServicesConfig();
    config.transcription.provider = 'whisper.cpp'; config.transcription.whisperCpp.model = 'tiny';
    expect(creatorTranscriptionModel(config)).toBe('tiny');
    config.transcription.whisperCpp.model = 'large-v3-turbo';
    expect(creatorTranscriptionModel(config)).toBe('large-v3-turbo');
    config.transcription.provider = 'openai'; config.transcription.openai.model = 'custom-model';
    expect(creatorTranscriptionModel(config)).toBe('whisper-1');
    expect(creatorTranscriptionModel(config, 'official-model')).toBe('official-model');
  });
});
