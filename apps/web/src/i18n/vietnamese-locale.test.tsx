// VI-1 Vietnamese locale plumbing gates.
//
// Covers: VI_LOCALE_TYPE, VI_SYSTEM_RESOLUTION, VI_VN_RESOLUTION,
// VI_UNDERSCORE_RESOLUTION, LANGUAGE_PERSISTENCE, INVALID_LOCALE_FALLBACK,
// HTML_LANG_VI, DATA_LOCALE_VI, LANGUAGE_SELECTOR_VI,
// VI_INLINE_ENGLISH_FALLBACK, ENGLISH_KEY_COLLISION_AUDIT,
// CONTENT_LANGUAGE_VI_UNCHANGED.
//
// VI_INLINE_MAP_OVERRIDE lives in vietnamese-inline-copy.test.ts (it needs a
// mocked non-empty map; this file asserts against the real, intentionally
// empty VI-1 map).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import ts from 'typescript';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useAppLanguage } from './LanguageProvider.js';
import {
  applyAppLanguage,
  languagePreferenceStorageKey,
  readLanguagePreference,
  resolveAppLanguage,
  resolveSystemLanguage,
  writeLanguagePreference,
  type AppLanguage,
  type AppLanguagePreference
} from './language.js';
import { createLocalizedCopy } from './localized-copy.js';
import { vietnameseInlineCopy } from './vietnamese-inline-copy.js';
import { OpenCreatorSettingsView } from '../features/settings/OpenCreatorSettingsView.js';

const runtimeStatus = {
  connected: true,
  appVersion: '3.2.1',
  runtimeVersion: '0.9.1',
  codexVersion: 'codex-cli 1.2.3',
  codexPath: '/opt/homebrew/bin/codex',
  codexHome: '/Users/wulien/.codex',
  lastCheckedAt: '2026-07-07 10:00'
};

function Probe() {
  const { t } = useAppLanguage();
  return (
    <>
      <span data-testid="probe-general">{t('settings.tab.general')}</span>
      <span data-testid="probe-vi-name">{t('settings.language.vi')}</span>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('lang');
  delete document.documentElement.dataset.locale;
});

describe('VI-1 Vietnamese locale plumbing', () => {
  it('VI_LOCALE_TYPE: vi-VN is a first-class UI locale distinct from content vi', () => {
    const uiLocale: AppLanguage = 'vi-VN';
    const uiPreference: AppLanguagePreference = 'vi-VN';
    expect(uiLocale).toBe('vi-VN');
    expect(uiPreference).toBe('vi-VN');
    // The bare content-language code 'vi' must never typecheck or resolve as UI.
    expect(uiLocale).not.toBe('vi');
  });

  it('VI_SYSTEM_RESOLUTION / VI_VN_RESOLUTION / VI_UNDERSCORE_RESOLUTION', () => {
    expect(resolveSystemLanguage(['vi'])).toBe('vi-VN');
    expect(resolveSystemLanguage(['vi-VN'])).toBe('vi-VN');
    expect(resolveSystemLanguage(['vi_VN'])).toBe('vi-VN');
    expect(resolveSystemLanguage(['VI-vn'])).toBe('vi-VN');
    expect(resolveAppLanguage('system', ['vi-VN', 'en-US'])).toBe('vi-VN');
    // Explicit preference bypasses resolution untouched.
    expect(resolveAppLanguage('vi-VN', ['zh-CN'])).toBe('vi-VN');
    // Pre-existing locales keep priority order and behavior.
    expect(resolveSystemLanguage(['en-US', 'vi-VN'])).toBe('en-US');
    expect(resolveSystemLanguage(['vi-VN', 'zh-CN'])).toBe('vi-VN');
    expect(resolveSystemLanguage(['zh-TW'])).toBe('zh-CN');
    expect(resolveSystemLanguage(['sv-SE'])).toBe('sv-SE');
    expect(resolveSystemLanguage(['fr-FR'])).toBe('en-US');
  });

  it('LANGUAGE_PERSISTENCE: vi-VN survives the reload path (localStorage roundtrip)', () => {
    writeLanguagePreference('vi-VN');
    expect(window.localStorage.getItem(languagePreferenceStorageKey)).toBe('vi-VN');
    // Boot path (main.tsx) resolves purely from the persisted preference.
    expect(resolveAppLanguage(readLanguagePreference(), ['en-US'])).toBe('vi-VN');
  });

  it('INVALID_LOCALE_FALLBACK: unknown and bare-vi values fall back safely', () => {
    window.localStorage.setItem(languagePreferenceStorageKey, 'xx-YY');
    expect(readLanguagePreference()).toBe('system');
    // Bare content code 'vi' is not a valid UI preference.
    window.localStorage.setItem(languagePreferenceStorageKey, 'vi');
    expect(readLanguagePreference()).toBe('system');
    expect(resolveAppLanguage('system', ['xx-YY'])).toBe('en-US');
  });

  it('HTML_LANG_VI / DATA_LOCALE_VI: document attributes follow vi-VN', () => {
    applyAppLanguage('vi-VN');
    expect(document.documentElement).toHaveAttribute('lang', 'vi-VN');
    expect(document.documentElement).toHaveAttribute('data-locale', 'vi-VN');
  });

  it('LANGUAGE_SELECTOR_VI: settings offers Tiếng Việt and switches without reload', () => {
    render(
      <LanguageProvider initialPreference="en-US">
        <OpenCreatorSettingsView runtimeStatus={runtimeStatus} onBack={() => undefined} />
      </LanguageProvider>
    );

    const selector = screen.getByRole('combobox', { name: 'Display language' });
    expect(screen.getByRole('option', { name: 'Tiếng Việt' })).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'vi-VN' } });

    // RELOAD_PERSISTENCE + RUNTIME_SWITCH: persisted, applied live, no reload.
    expect(window.localStorage.getItem(languagePreferenceStorageKey)).toBe('vi-VN');
    expect(document.documentElement).toHaveAttribute('lang', 'vi-VN');
    expect(document.documentElement).toHaveAttribute('data-locale', 'vi-VN');
    expect(screen.getByRole('combobox', { name: 'Display language' })).toHaveValue('vi-VN');
    // VI-1 intentionally falls back to English (deterministic, no raw keys).
    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    // No Chinese fallback leaks into the Vietnamese UI on this surface.
    expect(screen.queryByText('常规')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'System (Tiếng Việt)' })).toBeInTheDocument();
  });

  it('central dictionary: vi-VN falls back to English except language identity', () => {
    render(
      <LanguageProvider initialPreference="vi-VN">
        <Probe />
      </LanguageProvider>
    );
    expect(screen.getByTestId('probe-general')).toHaveTextContent('General');
    expect(screen.getByTestId('probe-vi-name')).toHaveTextContent('Tiếng Việt');
  });

  it('VI_INLINE_ENGLISH_FALLBACK: empty VI-1 map renders English, never Chinese', () => {
    expect(vietnameseInlineCopy).toEqual({});
    const l = createLocalizedCopy('vi-VN');
    expect(l('默认项目位置', 'Default project location')).toBe('Default project location');
    expect(l('返回', 'Back')).toBe('Back');
    // Other locales are unaffected by the vi-VN branch.
    expect(createLocalizedCopy('zh-CN')('默认项目位置', 'Default project location')).toBe('默认项目位置');
    expect(createLocalizedCopy('en-US')('默认项目位置', 'Default project location')).toBe('Default project location');
  });

  it('ENGLISH_KEY_COLLISION_AUDIT: no vietnamese map key may be context-divergent', () => {
    const pairs = collectInlineCopyPairs();
    // Sanity: the scan must actually see the inline-copy landscape.
    expect(pairs.length).toBeGreaterThan(100);
    const byEnglish = new Map<string, Set<string>>();
    for (const pair of pairs) {
      const set = byEnglish.get(pair.english) ?? new Set<string>();
      set.add(pair.chinese);
      byEnglish.set(pair.english, set);
    }
    const divergent = [...byEnglish.entries()]
      .filter(([, chinese]) => chinese.size > 1)
      .map(([english]) => english);
    // Audited baseline (2026-10-09): the same English copy carries materially
    // different meanings (e.g. 'Provider', 'Voice', 'Prompt', 'Settings',
    // 'Back', 'Preview') so a single EN→VI entry cannot translate those sites.
    // This gate pins the constraint: divergent keys must be fixed per-site in
    // VI-2 (explicit 4th argument or t() migration), never via the map.
    expect(divergent.length).toBeGreaterThan(0);
    const violations = Object.keys(vietnameseInlineCopy).filter(key => divergent.includes(key));
    expect(violations).toEqual([]);
  });

  it('CONTENT_LANGUAGE_VI_UNCHANGED: UI vi-VN is decoupled from content vi', () => {
    // UI resolution never produces the bare content code.
    expect(resolveSystemLanguage(['vi', 'vi-VN', 'vi_VN'])).not.toBe('vi');
    // The i18n layer carries no content-pipeline language semantics: no
    // target_language, subtitle, transcription, or runtime language contracts.
    const i18nDir = resolve(process.cwd(), 'src', 'i18n');
    const forbidden = /target_language|LanguageNameVietnamese|transcription.*language|subtitle.*target/i;
    const offenders: string[] = [];
    for (const file of readdirSync(i18nDir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue;
      const content = readFileSync(join(i18nDir, file), 'utf8');
      if (forbidden.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

function collectInlineCopyPairs(): Array<{ chinese: string; english: string; file: string }> {
  const root = resolve(process.cwd(), 'src');
  const pairs: Array<{ chinese: string; english: string; file: string }> = [];
  const visitFile = (path: string, relative: string) => {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && (node.expression.text === 'l' || node.expression.text === 'localize')
        && node.arguments.length >= 2
      ) {
        const chineseArg = node.arguments[0];
        const englishArg = node.arguments[1];
        if (chineseArg !== undefined && englishArg !== undefined && ts.isStringLiteralLike(chineseArg) && ts.isStringLiteralLike(englishArg)) {
          pairs.push({ chinese: chineseArg.text, english: englishArg.text, file: relative });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  };
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        && !entry.name.endsWith('.test.ts')
        && !entry.name.endsWith('.test.tsx')
      ) {
        visitFile(join(dir, entry.name), `${prefix}${entry.name}`);
      }
    }
  };
  walk(root, '');
  return pairs;
}
