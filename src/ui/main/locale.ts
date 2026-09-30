/**
 * Fluent Reduct - main-process locale resolution.
 *
 * The main process owns the active language because it builds the tray menu and
 * window before the renderer runs. The renderer mirrors this choice and reports
 * back through `locale:set`, which keeps the tray in sync when the user switches
 * language in Settings.
 */

import { app } from 'electron';
import {
  DEFAULT_LOCALE,
  createTranslator,
  resolveLocale,
  type LocaleCode,
  type Translator,
} from '../../shared/i18n/translate';
import type { AppSettings } from '../../shared/types';

let currentLocale: LocaleCode = DEFAULT_LOCALE;

/**
 * Resolve the locale from settings: an explicit choice wins, `system` follows
 * Electron's locale (which already reflects the OS language).
 */
export function initLocale(settings: AppSettings): LocaleCode {
  currentLocale =
    settings.language === 'system' ? resolveLocale(app.getLocale()) : settings.language;
  return currentLocale;
}

export function setLocale(locale: LocaleCode): void {
  currentLocale = locale;
}

export function getLocale(): LocaleCode {
  return currentLocale;
}

/** Translator bound to the currently active locale. */
export function t(): Translator {
  return createTranslator(currentLocale);
}
