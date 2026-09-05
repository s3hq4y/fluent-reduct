/**
 * Fluent Reduct - Type definitions
 */

// ==================== Memory types ====================

export interface MemoryRegion {
  total: number;
  used: number;
  free: number;
  percent: number;
  percentFormatted: number;
}

export interface MemoryInfo {
  physical: MemoryRegion;
  pagefile: MemoryRegion;
  systemCache: MemoryRegion;
  /** native = from Windows native API; fallback = native interface unavailable */
  source: 'native' | 'fallback';
  error?: string;
}

// ==================== Cleanup types ====================

export type CleanupArea =
  | 'workingset'
  | 'systemfilecache'
  | 'standbypriority0'
  | 'modifiedlist'
  | 'standbylist'
  | 'modifiedfilecache'
  | 'registrycache'
  | 'combinememory';

export interface CleanupConfig {
  mode: 'default' | 'custom';
  areas: Record<CleanupArea, boolean>;
}

export interface CleanupProgress {
  percent: number;
  currentArea: string;
  areaIndex: number;
  step: number;
  totalSteps: number;
}

export interface AreaResult {
  area: CleanupArea;
  ok: boolean;
  status: string;
  message: string;
}

export interface CleanupResult {
  /** Physical memory actually freed, in bytes */
  freedMemory: number;
  duration: number;
  areas: CleanupArea[];
  areaResults: AreaResult[];
  /** Whether the current process is running as administrator */
  elevated: boolean;
  timestamp: number;
  before: MemoryInfo;
  after: MemoryInfo;
}

export interface CleanupProgressEvent {
  area: CleanupArea;
  label: string;
  index: number;
  total: number;
}

export interface MemoryDiagnostics {
  platform: string;
  arch: string;
  nativeAvailable: boolean;
  elevated: boolean;
  error: string | null;
}

// ==================== Auto-clean types ====================

export interface AutoCleanConfig {
  enabled: boolean;
  threshold: number;
  interval: number;
  allowStandbyList: boolean;
}

// ==================== Theme types ====================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AccentColor {
  name: string;
  value: string;
}

export interface ThemeConfig {
  mode: ThemeMode;
  accentColor: string;
  customColors: string[];
}

// ==================== Settings types ====================

export interface AppSettings {
  // General
  alwaysOnTop: boolean;
  startup: boolean;
  startMinimized: boolean;
  confirmClean: boolean;
  checkUpdates: boolean;
  language: string;

  // Memory
  logResults: boolean;
  showResult: boolean;
  hotkeyEnable: boolean;
  hotkey: string;

  // Appearance
  theme: ThemeConfig;

  // Tray
  warningLevel: number;
  dangerLevel: number;
  singleClick: TrayAction;
  middleClick: TrayAction;
  notificationSound: boolean;

  // Advanced
  allowStandbyList: boolean;
}

export type TrayAction = 'show' | 'clean' | 'taskmanager';

// ==================== Stats types ====================

export interface AppStats {
  totalCleans: number;
  totalFreed: number;
  lastClean: number | null;
  startTime: number;
}

// ==================== Cleanup log types ====================

export type CleanupLogStatus = 'success' | 'partial' | 'failed';

export interface CleanupLogEntry {
  /** Unique id */
  id: string;
  /** Timestamp (ms) */
  time: number;
  /** Physical memory actually freed (bytes); 0 on failure */
  freed: number;
  /** Duration (seconds) */
  durationSec: number;
  /** Number of areas attempted this run */
  areasCount: number;
  /** Number of succeeded / failed areas */
  okCount: number;
  failCount: number;
  /** Physical memory usage before / after cleanup (%) */
  percentBefore: number;
  percentAfter: number;
  status: CleanupLogStatus;
  /** Short note when failed or partially failed */
  message?: string;
  /** Whether triggered by auto-clean */
  auto: boolean;
}

// ==================== UI state types ====================

export interface UIState {
  isCleaning: boolean;
  showSettings: boolean;
  showConfirm: boolean;
  activeTab: SettingsTab;
  isMaximized: boolean;
}

export type SettingsTab = 'general' | 'memory' | 'appearance' | 'tray' | 'advanced';

// ==================== Cleanup area info ====================

export interface CleanupAreaInfo {
  id: CleanupArea;
  name: string;
  nameEn: string;
  description: string;
  warning?: string;
  minOsVersion?: string;
}

// ==================== Toast types ====================

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// ==================== Electron API types ====================

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    quit: () => void;
    isMaximized: () => Promise<boolean>;
    setAlwaysOnTop: (value: boolean) => void;
  };
  system: {
    getInfo: () => Promise<SystemInfo>;
    getVersion: () => Promise<VersionInfo>;
    getAppPath: (name: string) => Promise<string>;
  };
  shell: {
    openExternal: (url: string) => void;
    openFolder: (path: string) => void;
  };
  memory: {
    getInfo: () => Promise<MemoryInfo>;
    cleanup: (areas: CleanupArea[]) => Promise<CleanupResult>;
    getDiagnostics: () => Promise<MemoryDiagnostics>;
  };
  on: {
    triggerCleanup: (callback: () => void) => () => void;
    openSettings: (callback: () => void) => () => void;
    cleanupProgress: (callback: (progress: CleanupProgressEvent) => void) => () => void;
    windowStateChange: (callback: (state: WindowState) => void) => () => void;
  };
}

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  totalMemory: number;
  freeMemory: number;
  cpus: number;
}

export interface VersionInfo {
  app: string;
  electron: string;
  chrome: string;
  node: string;
}

// Extend the Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
