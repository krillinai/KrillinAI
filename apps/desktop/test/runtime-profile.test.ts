import { describe, expect, it } from 'vitest';
import { resolveDesktopUserDataPath } from '../src/main/runtime-profile.js';

describe('Desktop runtime profile', () => {
  it('keeps the installed userData directory unchanged', () => {
    expect(resolveDesktopUserDataPath(
      '/Users/demo/Library/Application Support/OpenCreator',
      false
    )).toBe('/Users/demo/Library/Application Support/OpenCreator');
  });

  it('isolates development Electron state from the installed app', () => {
    expect(resolveDesktopUserDataPath(
      '/Users/demo/Library/Application Support/OpenCreator',
      true
    )).toBe('/Users/demo/Library/Application Support/OpenCreator Development');
  });
});
