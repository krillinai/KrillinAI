// VI-1 override-path coverage for the Vietnamese backfill mechanism.
//
// The shipped vietnamese-inline-copy.ts is intentionally empty in VI-1, so
// the map-override branch is exercised here with a mocked map. This proves
// the plumbing (explicit 4th arg → map → English) without adding real
// Vietnamese copy ahead of VI-2.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./vietnamese-inline-copy.js', () => ({
  vietnameseInlineCopy: {
    Hello: 'Xin chào'
  } as Record<string, string>
}));

import { createLocalizedCopy } from './localized-copy.js';

describe('VI_INLINE_MAP_OVERRIDE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers an explicit fourth argument over the map', () => {
    const l = createLocalizedCopy('vi-VN');
    expect(l('你好', 'Hello', 'Hej', 'Xin chào trực tiếp')).toBe('Xin chào trực tiếp');
  });

  it('uses the backfill map when no explicit argument is given', () => {
    const l = createLocalizedCopy('vi-VN');
    expect(l('你好', 'Hello')).toBe('Xin chào');
  });

  it('falls back to English for unmapped copy', () => {
    const l = createLocalizedCopy('vi-VN');
    expect(l('再见', 'Goodbye')).toBe('Goodbye');
  });

  it('never falls back to Chinese under vi-VN', () => {
    const l = createLocalizedCopy('vi-VN');
    expect(l('再见', 'Goodbye')).not.toBe('再见');
  });
});
