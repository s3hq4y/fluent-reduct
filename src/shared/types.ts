/**
 * Fluent Reduct - shared domain and IPC contracts.
 *
 * This module is the single source of truth for every type that crosses the
 * main/renderer boundary, plus the configuration shapes persisted to disk.
 * It must stay environment-agnostic: no `node` APIs, no DOM APIs.
 */

import type { LocaleCode } from './i18n/translate';

// ==================== Memory readings ====================

export interface MemoryRegion {
  total: number;
  used: number;
  free: number;
  /** Usage percentage with one decimal place. */
  percent: number;
  /** Usage percentage rounded for display. */
  percentFormatted: number;
}

/** `native` = read through the Windows native APIs; `fallback` = native layer unavailable. */
export type MemorySource = 'native' | 'fallback';

export interface MemoryInfo {
  physical: MemoryRegion;
  pagefile: MemoryRegion;
  systemCache: MemoryRegion;
  source: MemorySource;
  /** Populated when `source` is `fallback`, so the UI can explain the degradation. */
  error?: string;
}

export interface MemoryDiagnostics {
  platform: string;
  arch: string;
  nativeAvailable: boolean;
  elevated: boolean;
  error: string | null;
}

// ==================== Cleanup ====================

export type CleanupArea =
  | 'workingset'
  | 'systemfilecache'
  | 'standbypriority0'
  | 'modifiedlist'
  | 'standbylist'
  | 'modifiedfilecache'
  | 'registrycache'
  | 'combinememory';

export interface AreaResult {
  area: CleanupArea;
  ok: boolean;
  /** NTSTATUS as an 8-digit hex string, or a sentinel such as `unavailable`. */
  status: string;
  /** Human-readable outcome, already localized by the main process. */
  message: string;
}

export interface CleanupResult {
  /** Physical memory actually freed, in bytes; never negative. */
  freedMemory: number;
  /** Wall-clock duration in seconds. */
  duration: number;
  /** Areas attempted, in execution order. */
  areas: CleanupArea[];
  areaResults: AreaResult[];
  /** Whether the process is running elevated. */
  elevated: boolean;
  timestamp: number;
  before: MemoryInfo;
  after: MemoryInfo;
}

export interface CleanupProgressEvent {
  area: CleanupArea;
  /** Localized label of the area being cleaned. */
  label: string;
  index: number;
  total: number;
}

export type CleanupMode = 'default' | 'custom';

export interface CleanupConfig {
  mode: CleanupMode;
  areas: Record<CleanupArea, boolean>;
}

// ==================== Auto cleanup ====================

export interface AutoCleanConfig {
  enabled: boolean;
  /** Physical memory usage percentage that triggers a cleanup. */
  threshold: number;
  /** Minimum minutes between two cleanups. */
  interval: number;
}

// ==================== Appearance ====================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  mode: ThemeMode;
  /** Accent color as `#rrggbb`. */
  accentColor: string;
}

// ==================== Settings ====================

export interface AppSettings {
  /** `system` follows the OS language. */
  language: LocaleCode | 'system';
  launchAtLogin: boolean;
  startMinimized: boolean;
  alwaysOnTop: boolean;
  confirmClean: boolean;
  showResult: boolean;
  logResults: boolean;
  /** Allow auto cleanup to also purge the standby list (may cause brief stalls). */
  allowStandbyList: boolean;
  /** Usage percentage at which the status badge turns to warning. */
  warningLevel: number;
  /** Usage percentage at which the status badge turns to danger. */
  dangerLevel: number;
  theme: ThemeConfig;
}

// ==================== Cleanup log ====================

export type CleanupLogStatus = 'success' | 'partial' | 'failed';

export interface CleanupLogEntry {
  id: string;
  /** Timestamp in milliseconds. */
  time: number;
  /** Physical memory freed, in bytes; 0 on failure. */
  freed: number;
  durationSec: number;
  areasCount: number;
  okCount: number;
  failCount: number;
  percentBefore: number;
  percentAfter: number;
  status: CleanupLogStatus;
  /** Localized note when the run failed or partially failed. */
  message?: string;
  /** Whether the run was triggered by auto cleanup. */
  auto: boolean;
}

// ==================== Persisted state ====================

/** Everything `electron-store` keeps for the application. */
export interface PersistedState {
  settings: AppSettings;
  cleanupConfig: CleanupConfig;
  autoClean: AutoCleanConfig;
  logs: CleanupLogEntry[];
}

// ==================== Window / app metadata ====================

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export interface VersionInfo {
  app: string;
  electron: string;
  chrome: string;
  node: string;
}

// ==================== Toasts ====================

export type ToastType = 'success' | 'warning' | 'error';

export interface ToastOptions {
  title: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss delay in milliseconds. */
  duration?: number;
}

// ==================== IPC surface ====================

/** The API `preload` exposes on `window.electronAPI`. */
export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
  };

  system: {
    getVersion: () => Promise<VersionInfo>;
  };

  memory: {
    getInfo: () => Promise<MemoryInfo>;
    cleanup: (areas: CleanupArea[]) => Promise<CleanupResult>;
    getDiagnostics: () => Promise<MemoryDiagnostics>;
  };

  store: {
    load: () => Promise<PersistedState>;
    saveSettings: (settings: AppSettings) => Promise<void>;
    saveCleanupConfig: (config: CleanupConfig) => Promise<void>;
    saveAutoClean: (config: AutoCleanConfig) => Promise<void>;
    addLog: (entry: CleanupLogEntry) => Promise<CleanupLogEntry[]>;
    clearLogs: () => Promise<void>;
    reset: () => Promise<PersistedState>;
  };

  locale: {
    /** Tell the main process which locale the UI resolved to (drives the tray menu). */
    set: (code: LocaleCode) => void;
  };

  on: {
    triggerCleanup: (callback: () => void) => () => void;
    openSettings: (callback: () => void) => () => void;
    cleanupProgress: (callback: (progress: CleanupProgressEvent) => void) => () => void;
    windowStateChange: (callback: (state: WindowState) => void) => () => void;
  };
}
