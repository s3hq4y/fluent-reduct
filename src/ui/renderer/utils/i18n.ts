/**
 * Fluent Reduct - renderer-side translation helpers.
 */

import {
  createTranslator,
  resolveLocale,
  type LocaleCode,
  type TranslationKey,
  type Translator,
} from '../../../shared/i18n/translate';
import type { AppSettings } from '../../../shared/types';

/** Locale the UI should use: an explicit choice, or the browser/OS language. */
export function resolveUiLocale(language: AppSettings['language']): LocaleCode {
  return language === 'system' ? resolveLocale(navigator.language) : language;
}

/** Build a translator for the given language setting. */
export function createUiTranslator(language: AppSettings['language']): Translator {
  return createTranslator(resolveUiLocale(language));
}

function applyAttribute(
  root: ParentNode,
  selector: string,
  attribute: string,
  t: Translator
): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    const key = element.dataset.i18nTitle ?? element.dataset.i18nAria;
    if (!key) return;
    element.setAttribute(attribute, t(key as TranslationKey));
  });
}

/**
 * Translate the static markup. Elements opt in with:
 *   data-i18n="key"        -> textContent
 *   data-i18n-title="key"  -> title attribute
 *   data-i18n-aria="key"   -> aria-label attribute
 */
export function applyStaticTranslations(t: Translator, root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key as TranslationKey);
  });

  applyAttribute(root, '[data-i18n-title]', 'title', t);
  applyAttribute(root, '[data-i18n-aria]', 'aria-label', t);
}

/** Sync `<html lang>` with the active locale. */
export function applyDocumentLanguage(locale: LocaleCode): void {
  document.documentElement.lang = locale;
}
