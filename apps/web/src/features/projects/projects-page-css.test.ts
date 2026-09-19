import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectsCss = readFileSync('src/features/projects/projects-page.css', 'utf8');

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return projectsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('projects page spacing', () => {
  it('aligns the page title and actions on the shared title row', () => {
    expect(cssBlock('.projects-page-header')).toContain('align-items: flex-start;');
    expect(cssBlock('.projects-page-header h1')).toContain('min-height: var(--page-title-row-height);');
    expect(cssBlock('.projects-header-actions')).toContain('min-height: var(--page-title-row-height);');
  });

  it('separates the subtitle from the primary navigation row', () => {
    expect(cssBlock('.projects-page-header p')).toContain('margin-top: 12px;');
    expect(cssBlock('.projects-page-header p')).toContain('line-height: 1.6;');
    expect(cssBlock('.projects-primary-row')).toContain('margin-top: 20px;');
  });

  it('gives the primary view tabs a stronger hierarchy than the category filters', () => {
    expect(cssBlock('.projects-dimension-tabs')).toContain('display: flex;');
    expect(cssBlock('.projects-primary-row')).toContain('border-bottom: 1px solid var(--border-hairline);');
    expect(cssBlock('.projects-dimension-tabs')).toContain('gap: 24px;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('display: inline-flex;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('gap: 8px;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('min-height: 44px;');
    expect(cssBlock('.projects-dimension-tabs button')).toContain('font-size: 14px;');
    expect(cssBlock('.projects-dimension-tabs button[aria-selected="true"]::after')).toContain('background: var(--accent);');
    expect(cssBlock('.projects-category-tabs button')).toContain('min-height: 34px;');
    expect(cssBlock('.projects-category-tabs button')).toContain('font-size: 12px;');
  });

  it('places the search in the primary navigation row without stretching the tabs', () => {
    expect(cssBlock('.projects-primary-row')).toContain('justify-content: space-between;');
    expect(cssBlock('.projects-dimension-tabs')).toContain('flex: 0 0 auto;');
    expect(cssBlock('.projects-search')).toContain('flex: 0 1 260px;');
  });

  it('keeps second-level categories compact, unframed, and on one scrollable row', () => {
    const tabs = cssBlock('.projects-category-tabs');
    expect(tabs).toContain('display: flex;');
    expect(tabs).toContain('overflow-x: auto;');
    expect(tabs).not.toContain('border:');
    expect(tabs).not.toContain('background:');
    expect(cssBlock('.projects-category-tabs button')).toContain('flex: 0 0 auto;');
    expect(cssBlock('.projects-category-tabs button')).toContain('white-space: nowrap;');
    expect(cssBlock('.projects-category-tabs button[aria-selected="true"]')).toContain('background: var(--surface-2);');
  });
});
