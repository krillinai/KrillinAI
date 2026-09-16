import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectsCss = readFileSync('src/features/projects/projects-page.css', 'utf8');

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return projectsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('projects page spacing', () => {
  it('separates the subtitle from the title and view tabs', () => {
    expect(cssBlock('.projects-page-header p')).toContain('margin-top: 12px;');
    expect(cssBlock('.projects-page-header p')).toContain('line-height: 1.6;');
    expect(cssBlock('.projects-dimension-tabs')).toContain('margin-top: 24px;');
  });

  it('spaces view tabs and their icons without preventing wrapping', () => {
    expect(cssBlock('.projects-dimension-tabs')).toContain('display: flex;');
    expect(cssBlock('.projects-dimension-tabs')).toContain('flex-wrap: wrap;');
    expect(cssBlock('.projects-dimension-tabs')).toContain('gap: 24px;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('display: inline-flex;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('gap: 8px;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('min-height: 40px;');
  });
});
