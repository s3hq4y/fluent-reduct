/**
 * Fluent Reduct - shared appearance constants.
 */

import type { TranslationKey } from './i18n/translate';
import type { ThemeConfig } from './types';

export type AccentColorId =
  | 'default'
  | 'indigo'
  | 'deepBlue'
  | 'teal'
  | 'green'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'grey';

export interface AccentColorOption {
  id: AccentColorId;
  /** Color as `#rrggbb`. */
  value: string;
  labelKey: TranslationKey;
}

export const ACCENT_COLORS: readonly AccentColorOption[] = [
  { id: 'default', value: '#0078d4', labelKey: 'accent.default' },
  { id: 'indigo', value: '#3f51b5', labelKey: 'accent.indigo' },
  { id: 'deepBlue', value: '#1565c0', labelKey: 'accent.deepBlue' },
  { id: 'teal', value: '#00897b', labelKey: 'accent.teal' },
  { id: 'green', value: '#43a047', labelKey: 'accent.green' },
  { id: 'orange', value: '#ef6c00', labelKey: 'accent.orange' },
  { id: 'red', value: '#e53935', labelKey: 'accent.red' },
  { id: 'pink', value: '#d81b60', labelKey: 'accent.pink' },
  { id: 'purple', value: '#8e24aa', labelKey: 'accent.purple' },
  { id: 'grey', value: '#546e7a', labelKey: 'accent.grey' },
];

export const DEFAULT_ACCENT_COLOR: string = ACCENT_COLORS[0].value;

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'light',
  accentColor: DEFAULT_ACCENT_COLOR,
};
