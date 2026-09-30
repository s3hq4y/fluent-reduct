/**
 * Fluent Reduct - Electron preload script.
 *
 * The only bridge between the renderer and the main process. Every method here
 * maps to one explicit IPC channel; the renderer never sees `ipcRenderer`, so
 * the reachable surface is exactly what is listed below.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings,
  AutoCleanConfig,
  CleanupArea,
  CleanupConfig,
  CleanupLogEntry,
  CleanupProgressEvent,
  ElectronAPI,
  PersistedState,
  WindowState,
} from '../../shared/types';
import type { LocaleCode } from '../../shared/i18n/translate';

type Unsubscribe = () => void;

/** Subscribe to a main-process event and return a disposer. */
function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const handler = (_event: unknown, payload: T): void => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

function subscribeVoid(channel: string, callback: () => void): Unsubscribe {
  const handler = (): void => callback();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },

  system: {
    getVersion: () => ipcRenderer.invoke('app-get-version'),
  },

  memory: {
    getInfo: () => ipcRenderer.invoke('memory-get-info'),
    cleanup: (areas: CleanupArea[]) => ipcRenderer.invoke('memory-cleanup', areas),
    getDiagnostics: () => ipcRenderer.invoke('memory-get-diagnostics'),
  },

  store: {
    load: (): Promise<PersistedState> => ipcRenderer.invoke('store-load'),
    saveSettings: (settings: AppSettings) => ipcRenderer.invoke('store-save-settings', settings),
    saveCleanupConfig: (config: CleanupConfig) =>
      ipcRenderer.invoke('store-save-cleanup', config),
    saveAutoClean: (config: AutoCleanConfig) => ipcRenderer.invoke('store-save-auto-clean', config),
    addLog: (entry: CleanupLogEntry): Promise<CleanupLogEntry[]> =>
      ipcRenderer.invoke('store-add-log', entry),
    clearLogs: () => ipcRenderer.invoke('store-clear-logs'),
    reset: (): Promise<PersistedState> => ipcRenderer.invoke('store-reset'),
  },

  locale: {
    set: (code: LocaleCode) => ipcRenderer.send('locale-set', code),
  },

  on: {
    triggerCleanup: (callback: () => void) => subscribeVoid('trigger-cleanup', callback),
    openSettings: (callback: () => void) => subscribeVoid('open-settings', callback),
    cleanupProgress: (callback: (progress: CleanupProgressEvent) => void) =>
      subscribe<CleanupProgressEvent>('cleanup-progress', callback),
    windowStateChange: (callback: (state: WindowState) => void) =>
      subscribe<WindowState>('window-state-changed', callback),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
