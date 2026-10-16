import japanese from './locales/ja-JP.json' with { type: 'json' };
import swedish from './locales/sv-SE.json' with { type: 'json' };
import korean from './locales/ko-KR.json' with { type: 'json' };
import spanish from './locales/es-ES.json' with { type: 'json' };
import french from './locales/fr-FR.json' with { type: 'json' };
import german from './locales/de-DE.json' with { type: 'json' };
import portuguese from './locales/pt-BR.json' with { type: 'json' };
import traditionalChinese from './locales/zh-TW.json' with { type: 'json' };
import italian from './locales/it-IT.json' with { type: 'json' };
import russian from './locales/ru-RU.json' with { type: 'json' };
import turkish from './locales/tr-TR.json' with { type: 'json' };
import indonesian from './locales/id-ID.json' with { type: 'json' };
import vietnamese from './locales/vi-VN.json' with { type: 'json' };
import thai from './locales/th-TH.json' with { type: 'json' };
import filipino from './locales/fil-PH.json' with { type: 'json' };
import hindi from './locales/hi-IN.json' with { type: 'json' };
import bengali from './locales/bn-BD.json' with { type: 'json' };
import polish from './locales/pl-PL.json' with { type: 'json' };
import ukrainian from './locales/uk-UA.json' with { type: 'json' };
import dutch from './locales/nl-NL.json' with { type: 'json' };
import malay from './locales/ms-MY.json' with { type: 'json' };
import danish from './locales/da-DK.json' with { type: 'json' };
import norwegianBokmal from './locales/nb-NO.json' with { type: 'json' };
import finnish from './locales/fi-FI.json' with { type: 'json' };
import czech from './locales/cs-CZ.json' with { type: 'json' };
import romanian from './locales/ro-RO.json' with { type: 'json' };
import hungarian from './locales/hu-HU.json' with { type: 'json' };
import greek from './locales/el-GR.json' with { type: 'json' };
import tamil from './locales/ta-IN.json' with { type: 'json' };
import telugu from './locales/te-IN.json' with { type: 'json' };
import bulgarian from './locales/bg-BG.json' with { type: 'json' };
import slovak from './locales/sk-SK.json' with { type: 'json' };
import croatian from './locales/hr-HR.json' with { type: 'json' };
import serbian from './locales/sr-RS.json' with { type: 'json' };
import arabic from './locales/ar-SA.json' with { type: 'json' };
import persian from './locales/fa-IR.json' with { type: 'json' };
import urdu from './locales/ur-PK.json' with { type: 'json' };
import hebrew from './locales/he-IL.json' with { type: 'json' };
import marathi from './locales/mr-IN.json' with { type: 'json' };
import gujarati from './locales/gu-IN.json' with { type: 'json' };
import punjabi from './locales/pa-IN.json' with { type: 'json' };
import type { AppLanguage } from './language.js';

export const additionalLanguageCatalogs: Readonly<Partial<Record<AppLanguage, Readonly<Record<string, string>>>>> = {
  'sv-SE': swedish,
  'ja-JP': japanese,
  'ko-KR': korean,
  'es-ES': spanish,
  'fr-FR': french,
  'de-DE': german,
  'pt-BR': portuguese,
  'zh-TW': traditionalChinese,
  'it-IT': italian,
  'ru-RU': russian,
  'tr-TR': turkish,
  'id-ID': indonesian,
  'vi-VN': vietnamese,
  'th-TH': thai,
  'fil-PH': filipino,
  'hi-IN': hindi,
  'bn-BD': bengali,
  'pl-PL': polish,
  'uk-UA': ukrainian,
  'nl-NL': dutch,
  'ms-MY': malay,
  'da-DK': danish,
  'nb-NO': norwegianBokmal,
  'fi-FI': finnish,
  'cs-CZ': czech,
  'ro-RO': romanian,
  'hu-HU': hungarian,
  'el-GR': greek,
  'ta-IN': tamil,
  'te-IN': telugu,
  'bg-BG': bulgarian,
  'sk-SK': slovak,
  'hr-HR': croatian,
  'sr-RS': serbian,
  'ar-SA': arabic,
  'fa-IR': persian,
  'ur-PK': urdu,
  'he-IL': hebrew,
  'mr-IN': marathi,
  'gu-IN': gujarati,
  'pa-IN': punjabi
};

type TemplateMatcher = { pattern: RegExp; slots: string[]; translation: string };
const templateMatchers = new Map<AppLanguage, TemplateMatcher[]>();

export function translateTraditionalChinese(english: string): string | undefined {
  const translated = translateEnglishCopy('zh-TW', english);
  return translated === english ? undefined : translated;
}

export function translateEnglishCopy(language: AppLanguage, english: string): string {
  const catalog = additionalLanguageCatalogs[language];
  if (!catalog) return english;
  if (Object.hasOwn(catalog, english)) return catalog[english]!;

  let matchers = templateMatchers.get(language);
  if (!matchers) {
    matchers = Object.entries(catalog).filter(([source]) => /\{\{\d+\}\}/.test(source))
      // Prefer specific phrases over a broader template such as "Download {{0}}".
      .sort(([a], [b]) => b.replace(/\{\{\d+\}\}/g, '').length - a.replace(/\{\{\d+\}\}/g, '').length)
      .map(([source, translation]) => {
      const slots: string[] = [];
      // Keep interpolated values intact while allowing translations to reorder them.
      const pattern = source.split(/(\{\{\d+\}\})/).map(part => {
        if (/^\{\{\d+\}\}$/.test(part)) { slots.push(part); return '([\\s\\S]*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      return { pattern: new RegExp(`^${pattern}$`), slots, translation };
    });
    templateMatchers.set(language, matchers);
  }

  for (const { pattern, slots, translation } of matchers) {
    const match = pattern.exec(english);
    if (!match) continue;
    return translation.replace(/\{\{\d+\}\}/g, slot => match[slots.indexOf(slot) + 1] ?? slot);
  }
  return english;
}
