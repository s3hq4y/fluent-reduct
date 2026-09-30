/**
 * Fluent Reduct - shared defaults and validation for persisted state.
 *
 * `normalizeState` is the single place that merges stored data with defaults,
 * so a partial, outdated or corrupted store can never reach the application.
 */

import { DEFAULT_CLEANUP_AREAS } from './cleanup';
import { DEFAULT_THEME } from './theme';
import type {
  AppSettings,
  AutoCleanConfig,
  CleanupArea,
  CleanupConfig,
  CleanupLogEntry,
  CleanupLogStatus,
  PersistedState,
  ThemeMode,
} from './types';
import { isLocaleCode } from './i18n/translate';

/** Maximum number of cleanup log entries kept on disk. */
export const LOG_ENTRY_LIMIT = 100;

/** Editable ranges for the auto-cleanup inputs. */
export const AUTO_CLEAN_LIMITS = {
  threshold: { min: 50, max: 95 },
  interval: { min: 1, max: 1440 },
} as const;

export const AUTO_CLEAN_DEFAULTS: AutoCleanConfig = {
  enabled: false,
  threshold: 90,
  interval: 30,
};

export const SETTINGS_DEFAULTS: AppSettings = {
  language: 'system',
  launchAtLogin: false,
  startMinimized: false,
  alwaysOnTop: false,
  confirmClean: true,
  showResult: true,
  logResults: true,
  allowStandbyList: false,
  warningLevel: 70,
  dangerLevel: 90,
  theme: DEFAULT_THEME,
};

export const CLEANUP_DEFAULTS: CleanupConfig = {
  mode: 'default',
  areas: { ...DEFAULT_CLEANUP_AREAS },
};

export const PERSISTED_DEFAULTS: PersistedState = {
  settings: SETTINGS_DEFAULTS,
  cleanupConfig: CLEANUP_DEFAULTS,
  autoClean: AUTO_CLEAN_DEFAULTS,
  logs: [],
};

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const LOG_STATUSES: readonly CleanupLogStatus[] = ['success', 'partial', 'failed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Clamp a value read from a number input, falling back when it is not numeric. */
export function clampNumberInput(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTheme(raw: unknown): AppSettings['theme'] {
  if (!isRecord(raw)) return { ...DEFAULT_THEME };
  const mode = THEME_MODES.includes(raw.mode as ThemeMode)
    ? (raw.mode as ThemeMode)
    : DEFAULT_THEME.mode;
  const accentColor =
    typeof raw.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accentColor)
      ? raw.accentColor
      : DEFAULT_THEME.accentColor;
  return { mode, accentColor };
}

function normalizeSettings(raw: unknown): AppSettings {
  const source = isRecord(raw) ? raw : {};
  const language =
    source.language === 'system' || isLocaleCode(source.language)
      ? (source.language as AppSettings['language'])
      : SETTINGS_DEFAULTS.language;

  return {
    language,
    launchAtLogin: pickBoolean(source.launchAtLogin, SETTINGS_DEFAULTS.launchAtLogin),
    startMinimized: pickBoolean(source.startMinimized, SETTINGS_DEFAULTS.startMinimized),
    alwaysOnTop: pickBoolean(source.alwaysOnTop, SETTINGS_DEFAULTS.alwaysOnTop),
    confirmClean: pickBoolean(source.confirmClean, SETTINGS_DEFAULTS.confirmClean),
    showResult: pickBoolean(source.showResult, SETTINGS_DEFAULTS.showResult),
    logResults: pickBoolean(source.logResults, SETTINGS_DEFAULTS.logResults),
    allowStandbyList: pickBoolean(source.allowStandbyList, SETTINGS_DEFAULTS.allowStandbyList),
    warningLevel: pickNumber(source.warningLevel, SETTINGS_DEFAULTS.warningLevel, 0, 100),
    dangerLevel: pickNumber(source.dangerLevel, SETTINGS_DEFAULTS.dangerLevel, 0, 100),
    theme: normalizeTheme(source.theme),
  };
}

function normalizeCleanupAreas(raw: unknown): Record<CleanupArea, boolean> {
  const source = isRecord(raw) ? raw : {};
  const areas = { ...DEFAULT_CLEANUP_AREAS };
  for (const area of Object.keys(areas) as CleanupArea[]) {
    areas[area] = pickBoolean(source[area], areas[area]);
  }
  return areas;
}

function normalizeCleanupConfig(raw: unknown): CleanupConfig {
  const source = isRecord(raw) ? raw : {};
  const mode = source.mode === 'custom' ? 'custom' : 'default';
  return { mode, areas: normalizeCleanupAreas(source.areas) };
}

function normalizeAutoClean(raw: unknown): AutoCleanConfig {
  const source = isRecord(raw) ? raw : {};
  return {
    enabled: pickBoolean(source.enabled, AUTO_CLEAN_DEFAULTS.enabled),
    threshold: pickNumber(
      source.threshold,
      AUTO_CLEAN_DEFAULTS.threshold,
      AUTO_CLEAN_LIMITS.threshold.min,
      AUTO_CLEAN_LIMITS.threshold.max
    ),
    interval: pickNumber(
      source.interval,
      AUTO_CLEAN_DEFAULTS.interval,
      AUTO_CLEAN_LIMITS.interval.min,
      AUTO_CLEAN_LIMITS.interval.max
    ),
  };
}

function normalizeLogEntry(raw: unknown): CleanupLogEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.time !== 'number') return null;
  const status = LOG_STATUSES.includes(raw.status as CleanupLogStatus)
    ? (raw.status as CleanupLogStatus)
    : 'failed';
  return {
    id: raw.id,
    time: raw.time,
    freed: pickNumber(raw.freed, 0, 0, Number.MAX_SAFE_INTEGER),
    durationSec: pickNumber(raw.durationSec, 0, 0, Number.MAX_SAFE_INTEGER),
    areasCount: pickNumber(raw.areasCount, 0, 0, Number.MAX_SAFE_INTEGER),
    okCount: pickNumber(raw.okCount, 0, 0, Number.MAX_SAFE_INTEGER),
    failCount: pickNumber(raw.failCount, 0, 0, Number.MAX_SAFE_INTEGER),
    percentBefore: pickNumber(raw.percentBefore, 0, 0, 100),
    percentAfter: pickNumber(raw.percentAfter, 0, 0, 100),
    status,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    auto: pickBoolean(raw.auto, false),
  };
}

/** Merge arbitrary stored data with the defaults, dropping anything malformed. */
export function normalizeState(raw: unknown): PersistedState {
  const source = isRecord(raw) ? raw : {};
  const logs = Array.isArray(source.logs)
    ? source.logs
        .map(normalizeLogEntry)
        .filter((entry): entry is CleanupLogEntry => entry !== null)
        .slice(0, LOG_ENTRY_LIMIT)
    : [];

  return {
    settings: normalizeSettings(source.settings),
    cleanupConfig: normalizeCleanupConfig(source.cleanupConfig),
    autoClean: normalizeAutoClean(source.autoClean),
    logs,
  };
}
