import { creatorLanguages, creatorTranscriptionProfiles } from './creator-languages.generated.js';
export { creatorLanguages } from './creator-languages.generated.js';

export type CreatorLanguage = typeof creatorLanguages[number];

/** Product codes stay stable; provider token mapping belongs at the ASR boundary. */
export function normalizeCreatorLanguage(value: string): string {
  const code = value.trim().toLowerCase().replaceAll('_', '-');
  if (['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'].includes(code)) return 'zh_tw';
  if (['zh', 'zh-cn', 'zh-hans', 'zh-sg'].includes(code)) return 'zh_cn';
  const base = code.split('-')[0]!;
  return creatorLanguages.find(item => item.code === base || (item.aliases as readonly string[]).includes(base))?.code ?? code;
}

export function creatorLanguage(value: string): CreatorLanguage | undefined {
  const code = normalizeCreatorLanguage(value);
  return creatorLanguages.find(item => item.code === code);
}

export function searchCreatorLanguages(query: string, source = false): readonly CreatorLanguage[] {
  const needle = query.trim().toLocaleLowerCase();
  return creatorLanguages.filter(item => (!source || item.speech) && (!needle ||
    [item.code, item.nativeName, item.englishName, item.chineseName, ...item.aliases]
      .some(value => value.toLocaleLowerCase().includes(needle))));
}

export type TranscriptionLanguageCapability = {
  coverage: 'complete' | 'partial' | 'unknown';
  supportedLanguages: string[];
  unsupportedLanguages?: string[];
  timestamps: 'word' | 'segment' | 'none' | 'unknown';
  profileVersion: string;
};

export function transcriptionLanguageSupport(language: string, capability?: TranscriptionLanguageCapability): 'supported' | 'unsupported' | 'unknown' {
  const code = normalizeCreatorLanguage(language);
  if (code === 'auto') return 'unknown'; // Existing auto-clip jobs retain automatic detection.
  if (creatorLanguage(code)?.speech === false) return 'unsupported';
  if (!capability) return 'unknown';
  if (capability.unsupportedLanguages?.some(item => normalizeCreatorLanguage(item) === code)) return 'unsupported';
  if (capability.supportedLanguages.some(item => normalizeCreatorLanguage(item) === code)) return 'supported';
  return capability.coverage === 'complete' ? 'unsupported' : 'unknown';
}

export function whisperLanguageCode(language: string): string {
  const code = normalizeCreatorLanguage(language);
  return ({ zh_cn: 'zh', zh_tw: 'zh', fil: 'tl', jv: 'jw' } as Record<string, string>)[code] ?? code;
}

/** Only bundled, identified Whisper models have a closed language set. */
export function localWhisperLanguageCapability(model: string): TranscriptionLanguageCapability {
  const version = creatorTranscriptionProfiles.version;
  if (/^(tiny|base|small|medium)\.en$/.test(model)) return { coverage: 'complete', supportedLanguages: ['en'], timestamps: 'word', profileVersion: version };
  if (!/^(tiny|base|small|medium|large|large-v[123]|large-v3-turbo|turbo)$/.test(model)) return unknownTranscriptionCapability();
  return { coverage: 'complete', supportedLanguages: [...(/^(large|large-v3|large-v3-turbo|turbo)$/.test(model) ? creatorTranscriptionProfiles.whisperV3 : creatorTranscriptionProfiles.whisperV2)], timestamps: 'word', profileVersion: version };
}

export function unknownTranscriptionCapability(): TranscriptionLanguageCapability {
  return { coverage: 'unknown', supportedLanguages: [], timestamps: 'unknown', profileVersion: 'unverified-v1' };
}

export function creatorTranscriptionModel(config: import('./creator-services.js').CreatorServicesConfig, officialModel?: string): string {
  switch (config.transcription.provider) {
    case 'whisperkit': return 'large-v2'; // Current CLI model path is fixed.
    case 'whisper.cpp': return config.transcription.whisperCpp.model; // The launcher mounts legacy models under a large-v2 filename.
    case 'faster-whisper': return config.transcription.fasterWhisper.model;
    case 'openai': return officialModel || 'whisper-1';
    case 'funasr': return config.transcription.funasr.model;
    case 'aliyun': return 'app-key-bound';
    case 'volcengine': return config.transcription.volcengine.resourceId;
  }
}
