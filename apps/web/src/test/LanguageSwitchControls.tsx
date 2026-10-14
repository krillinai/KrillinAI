import { useAppLanguage } from '../i18n/LanguageProvider.js';
import { appLanguageOptions } from '../i18n/language.js';

export function LanguageSwitchControls() {
  const { setPreference } = useAppLanguage();
  return <div>{appLanguageOptions.map(({ value: language }) =>
    <button key={language} type="button" onClick={() => setPreference(language)}>{language}</button>
  )}</div>;
}
