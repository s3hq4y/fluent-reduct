/**
 * Fluent Reduct - i18n core (shared by the main and renderer processes).
 *
 * Adding a language takes three steps:
 *   1. add `locales/<code>.ts`, typed as `Translations` (a missing key is a compile error)
 *   2. register it in `LOCALES` and `SUPPORTED_LOCALES` below
 *   3. pick it in Settings -> General -> Language
 */

import zhCN, { type TranslationKey } from './locales/zh-CN';
import en from './locales/en';
import ja from './locales/ja';

/** A complete locale: every key of the source locale must be present. */
export type Translations = Record<TranslationKey, string>;

export const LOCALES = {
  'zh-CN': zhCN,
  en,
  ja,
} satisfies Record<string, Translations>;

export type LocaleCode = keyof typeof LOCALES;

/**
 * Languages offered in the UI. `label` is the endonym (shown in its own
 * language) so a user can always recognise their language.
 */
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: LocaleCode; label: string }> = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN';

export type TranslationParams = Record<string, string | number>;

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && value in LOCALES;
}

/**
 * Resolve an arbitrary language tag (e.g. Electron's `app.getLocale()`) to a
 * supported locale. Unknown tags fall back to the default rather than throwing.
 */
export function resolveLocale(input: string | undefined | null): LocaleCode {
  if (!input) return DEFAULT_LOCALE;
  if (isLocaleCode(input)) return input;

  const lower = input.toLowerCase();
  const match = (Object.keys(LOCALES) as LocaleCode[]).find(
    (code) => lower === code.toLowerCase() || lower.startsWith(code.split('-')[0].toLowerCase())
  );
  return match ?? DEFAULT_LOCALE;
}

/** Replace `{placeholder}` tokens; unknown tokens are left untouched. */
function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    name in params ? String(params[name]) : token
  );
}

/** Translate a single key for a locale. */
export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const template = LOCALES[locale]?.[key] ?? LOCALES[DEFAULT_LOCALE][key];
  return interpolate(template, params);
}

export type Translator = (key: TranslationKey, params?: TranslationParams) => string;

const translatorCache = new Map<LocaleCode, Translator>();

/** Get (and cache) a bound translator for a locale. */
export function createTranslator(locale: LocaleCode): Translator {
  let translator = translatorCache.get(locale);
  if (!translator) {
    translator = (key, params) => translate(locale, key, params);
    translatorCache.set(locale, translator);
  }
  return translator;
}

export type { TranslationKey };
