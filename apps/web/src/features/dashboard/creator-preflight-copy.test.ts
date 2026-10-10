import { describe, expect, it } from 'vitest';
import { createLocalizedCopy } from '../../i18n/localized-copy.js';
import { creatorPreflightMessage } from './creator-preflight-copy.js';

describe('localized preflight guidance', () => {
  it.each(['input-result-version', 'bilibili-part', 'image-provider', 'transcription-capability', 'transcription-config', 'input-file', 'executor', 'yt-dlp', 'krillin-runtime', 'unknown-executor'])('supports all display languages for %s', id => {
    const chinese = creatorPreflightMessage(id, createLocalizedCopy('zh-CN'));
    const english = creatorPreflightMessage(id, createLocalizedCopy('en-US'));
    const swedish = creatorPreflightMessage(id, createLocalizedCopy('sv-SE'));
    expect(chinese).toMatch(/\p{Script=Han}/u);
    expect(english).not.toMatch(/\p{Script=Han}/u);
    expect(swedish).not.toMatch(/\p{Script=Han}/u);
    expect(swedish).not.toBe(english);
  });
});
