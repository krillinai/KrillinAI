import { describe, expect, it } from 'vitest';
import { coverStyleInstructions } from '../../src/creator/cover/styles.js';

describe('creator cover styles', () => {
  it.each([
    ['personal-growth', 'deep navy, warm gold, and bright white'],
    ['psychology', 'deep green, blue-gray, white, and a small coral accent'],
    ['wealth-platinum-red', 'white, platinum, charcoal, and strong red'],
    ['bilibili-red-blue-white', 'red, bright blue, white, and dark outlines']
  ] as const)('keeps %s visually distinct', (style, expected) => {
    expect(coverStyleInstructions(style, '')).toContain(expected);
  });

  it('uses the user description for a custom style', () => {
    expect(coverStyleInstructions('custom', 'Black and neon green technical style'))
      .toContain('Black and neon green technical style');
  });
});
