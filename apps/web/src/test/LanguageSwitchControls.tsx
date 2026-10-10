import { useAppLanguage } from '../i18n/LanguageProvider.js';

export function LanguageSwitchControls() {
  const { setPreference } = useAppLanguage();
  return <div>{(['zh-CN', 'en-US', 'sv-SE'] as const).map(language =>
    <button key={language} type="button" onClick={() => setPreference(language)}>{language}</button>
  )}</div>;
}
