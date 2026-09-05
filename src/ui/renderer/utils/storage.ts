/**
 * Fluent Reduct - Local storage management
 */

import type { AppSettings, AppStats, CleanupConfig, AutoCleanConfig, CleanupLogEntry, ThemeConfig } from '../types';

const STORAGE_KEYS = {
  SETTINGS: 'memreduct_settings',
  // v2: totalFreed unit changed from MB to bytes; use a new key to avoid mixing with old data
  STATS: 'memreduct_stats_v2',
  CLEANUP: 'memreduct_cleanup',
  AUTO_CLEAN: 'memreduct_auto_clean',
  THEME: 'memreduct_theme',
  LOGS: 'memreduct_cleanup_logs',
} as const;

/** Maximum number of cleanup log entries to keep (older ones are dropped) */
const MAX_LOG_ENTRIES = 100;

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: false,
  startup: false,
  startMinimized: false,
  confirmClean: true,
  checkUpdates: true,
  language: 'zh-CN',

  logResults: true,
  showResult: true,
  hotkeyEnable: false,
  hotkey: 'Ctrl+F1',
  theme: {
    mode: 'light',
    accentColor: '#0078d4',
    customColors: [],
  },
  warningLevel: 70,
  dangerLevel: 90,
  singleClick: 'show',
  middleClick: 'show',
  notificationSound: true,
  allowStandbyList: false,
};

export const DEFAULT_STATS: AppStats = {
  totalCleans: 0,
  totalFreed: 0,
  lastClean: null,
  startTime: Date.now(),
};

export const DEFAULT_CLEANUP: CleanupConfig = {
  mode: 'default',
  areas: {
    workingset: true,
    systemfilecache: true,
    standbypriority0: true,
    modifiedlist: false,
    standbylist: false,
    modifiedfilecache: true,
    registrycache: true,
    combinememory: true,
  },
};

export const DEFAULT_AUTO_CLEAN: AutoCleanConfig = {
  enabled: false,
  threshold: 90,
  interval: 30,
  allowStandbyList: false,
};

// Parse JSON safely
function safeParse<T>(json: string | null, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return { ...defaultValue, ...JSON.parse(json) };
  } catch {
    return defaultValue;
  }
}

// Storage manager
export const storage = {
  // Settings
  getSettings(): AppSettings {
    return safeParse(localStorage.getItem(STORAGE_KEYS.SETTINGS), DEFAULT_SETTINGS);
  },

  saveSettings(settings: AppSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Stats
  getStats(): AppStats {
    return safeParse(localStorage.getItem(STORAGE_KEYS.STATS), DEFAULT_STATS);
  },

  saveStats(stats: AppStats): void {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  },

  // Cleanup config
  getCleanupConfig(): CleanupConfig {
    return safeParse(localStorage.getItem(STORAGE_KEYS.CLEANUP), DEFAULT_CLEANUP);
  },

  saveCleanupConfig(config: CleanupConfig): void {
    localStorage.setItem(STORAGE_KEYS.CLEANUP, JSON.stringify(config));
  },

  // Auto-clean config
  getAutoCleanConfig(): AutoCleanConfig {
    return safeParse(localStorage.getItem(STORAGE_KEYS.AUTO_CLEAN), DEFAULT_AUTO_CLEAN);
  },

  saveAutoCleanConfig(config: AutoCleanConfig): void {
    localStorage.setItem(STORAGE_KEYS.AUTO_CLEAN, JSON.stringify(config));
  },

  // Theme config
  getThemeConfig(): ThemeConfig {
    return safeParse(localStorage.getItem(STORAGE_KEYS.THEME), DEFAULT_SETTINGS.theme);
  },

  saveThemeConfig(config: ThemeConfig): void {
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(config));
  },

  // Cleanup logs (returns newest first)
  getCleanupLogs(): CleanupLogEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CleanupLogEntry[]) : [];
    } catch {
      return [];
    }
  },

  // Append a cleanup log entry, keeping only the newest MAX_LOG_ENTRIES
  addCleanupLog(entry: CleanupLogEntry): CleanupLogEntry[] {
    const logs = this.getCleanupLogs();
    logs.unshift(entry);
    const trimmed = logs.slice(0, MAX_LOG_ENTRIES);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(trimmed));
    return trimmed;
  },

  clearCleanupLogs(): void {
    localStorage.removeItem(STORAGE_KEYS.LOGS);
  },

  // Clear all data
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  },
};
