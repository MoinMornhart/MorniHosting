import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

export const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

function initialLanguage(): Language {
  const stored = (() => {
    try {
      return localStorage.getItem('mh-lang');
    } catch {
      return null;
    }
  })();
  if (stored === 'de' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnNull: false,
  // Option values such as "minecraft:flat" contain colons; there is only one namespace.
  nsSeparator: false,
});

export function setLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  document.documentElement.lang = language;
  try {
    localStorage.setItem('mh-lang', language);
  } catch {
    // Private windows may refuse storage; the language still applies to this visit.
  }
}

export default i18n;
