/**
 * Fluent Reduct - persisted state (main process).
 *
 * All persistence lives in the main process so that settings needed *before*
 * the renderer exists (language, start-minimized, launch-at-login, always-on-top)
 * are available immediately. The renderer reaches this through IPC only.
 */

import Store from 'electron-store';
import { LOG_ENTRY_LIMIT, PERSISTED_DEFAULTS, normalizeState } from '../../shared/settings';
import type {
  AppSettings,
  AutoCleanConfig,
  CleanupConfig,
  CleanupLogEntry,
  PersistedState,
} from '../../shared/types';

const store = new Store<PersistedState>({
  name: 'fluent-reduct',
  defaults: PERSISTED_DEFAULTS,
});

/** Read the whole state, normalized so corrupted entries cannot leak through. */
export function loadState(): PersistedState {
  return normalizeState(store.store);
}

function persist(state: PersistedState): void {
  store.store = state;
}

export function getSettings(): AppSettings {
  return loadState().settings;
}

export function saveSettings(settings: AppSettings): void {
  const state = loadState();
  persist({ ...state, settings });
}

export function getCleanupConfig(): CleanupConfig {
  return loadState().cleanupConfig;
}

export function saveCleanupConfig(cleanupConfig: CleanupConfig): void {
  const state = loadState();
  persist({ ...state, cleanupConfig });
}

export function getAutoClean(): AutoCleanConfig {
  return loadState().autoClean;
}

export function saveAutoClean(autoClean: AutoCleanConfig): void {
  const state = loadState();
  persist({ ...state, autoClean });
}

export function getLogs(): CleanupLogEntry[] {
  return loadState().logs;
}

/** Prepend a log entry, trimming the oldest beyond the retention limit. */
export function addLog(entry: CleanupLogEntry): CleanupLogEntry[] {
  const state = loadState();
  const logs = [entry, ...state.logs].slice(0, LOG_ENTRY_LIMIT);
  persist({ ...state, logs });
  return logs;
}

export function clearLogs(): void {
  const state = loadState();
  persist({ ...state, logs: [] });
}

/** Restore every setting to its default. */
export function resetState(): PersistedState {
  persist(PERSISTED_DEFAULTS);
  return PERSISTED_DEFAULTS;
}
