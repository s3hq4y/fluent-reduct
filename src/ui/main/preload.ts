/**
 * Fluent Reduct - Electron preload script
 * Safely exposes IPC interfaces to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// API surface exposed to the renderer
export interface ElectronAPI {
  // Window controls
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    quit: () => void;
    isMaximized: () => Promise<boolean>;
    setAlwaysOnTop: (value: boolean) => void;
  };
  
  // System info
  system: {
    getInfo: () => Promise<SystemInfo>;
    getVersion: () => Promise<VersionInfo>;
    getAppPath: (name: string) => Promise<string>;
  };
  
  // External actions
  shell: {
    openExternal: (url: string) => void;
    openFolder: (path: string) => void;
  };
  
  // Memory (real data)
  memory: {
    getInfo: () => Promise<MemoryInfo>;
    cleanup: (areas: CleanupArea[]) => Promise<CleanupResult>;
    getDiagnostics: () => Promise<MemoryDiagnostics>;
  };

  // Event listeners
  on: {
    triggerCleanup: (callback: () => void) => () => void;
    openSettings: (callback: () => void) => () => void;
    cleanupProgress: (callback: (progress: CleanupProgressEvent) => void) => () => void;
    windowStateChange: (callback: (state: WindowState) => void) => () => void;
  };
}

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
  source: 'native' | 'fallback';
  error?: string;
}

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
  status: string;
  message: string;
}

export interface CleanupResult {
  freedMemory: number;
  duration: number;
  areas: CleanupArea[];
  areaResults: AreaResult[];
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

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
}

// API implementation
const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    quit: () => ipcRenderer.send('window-quit'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    setAlwaysOnTop: (value: boolean) => ipcRenderer.send('set-always-on-top', value),
  },
  
  system: {
    getInfo: () => ipcRenderer.invoke('get-system-info'),
    getVersion: () => ipcRenderer.invoke('get-version'),
    getAppPath: (name: string) => ipcRenderer.invoke('get-app-path', name),
  },
  
  shell: {
    openExternal: (url: string) => ipcRenderer.send('open-external', url),
    openFolder: (path: string) => ipcRenderer.send('open-folder', path),
  },
  
  memory: {
    getInfo: () => ipcRenderer.invoke('memory-get-info'),
    cleanup: (areas: CleanupArea[]) => ipcRenderer.invoke('memory-cleanup', areas),
    getDiagnostics: () => ipcRenderer.invoke('memory-get-diagnostics'),
  },

  on: {
    triggerCleanup: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('trigger-cleanup', handler);
      return () => ipcRenderer.removeListener('trigger-cleanup', handler);
    },
    openSettings: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('open-settings', handler);
      return () => ipcRenderer.removeListener('open-settings', handler);
    },
    cleanupProgress: (callback: (progress: CleanupProgressEvent) => void) => {
      const handler = (_event: unknown, progress: CleanupProgressEvent) => callback(progress);
      ipcRenderer.on('cleanup-progress', handler);
      return () => ipcRenderer.removeListener('cleanup-progress', handler);
    },
    windowStateChange: (callback: (state: WindowState) => void) => {
      const handler = (_event: unknown, state: WindowState) => callback(state);
      ipcRenderer.on('window-state-changed', handler);
      return () => ipcRenderer.removeListener('window-state-changed', handler);
    },
  },
};

// Expose the API via contextBridge
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
