/**
 * Fluent Reduct - Electron main process.
 *
 * Owns window/tray lifecycle, persistence and the native memory interface. The
 * renderer is untrusted: it can only reach these capabilities through the
 * channel whitelist defined in `preload.ts`.
 */

import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen } from 'electron';
import * as path from 'path';
import type {
  AppSettings,
  AutoCleanConfig,
  CleanupArea,
  CleanupLogEntry,
  PersistedState,
} from '../../shared/types';
import type { LocaleCode } from '../../shared/i18n/translate';
import { isLocaleCode } from '../../shared/i18n/translate';
import { getDiagnostics, getMemoryInfo, cleanupMemory } from './memory';
import { initLocale, setLocale, t } from './locale';
import {
  addLog,
  clearLogs,
  getSettings,
  loadState,
  resetState,
  saveAutoClean,
  saveCleanupConfig,
  saveSettings,
} from './store';

const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.ico');
const RENDERER_ENTRY = path.join(__dirname, '..', 'renderer', 'index.html');

/**
 * `minWidth` is set so the three memory rings always fit on one row: below it
 * the cards would have to shrink past their headers. Keep in sync with the
 * `clamp()` breakpoints in `styles/main.css`.
 */
const WINDOW_SIZE = { width: 560, height: 700, minWidth: 540, minHeight: 600 } as const;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ==================== Window ====================

function centeredBounds(): Electron.Rectangle {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.floor((width - WINDOW_SIZE.width) / 2),
    y: Math.floor((height - WINDOW_SIZE.height) / 2),
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
  };
}

function createMainWindow(settings: AppSettings): void {
  const bounds = centeredBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: WINDOW_SIZE.minWidth,
    minHeight: WINDOW_SIZE.minHeight,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  void mainWindow.loadFile(RENDERER_ENTRY);

  // Keep the titlebar glyph in sync with the real window state.
  const notifyWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('window-state-changed', {
      maximized: mainWindow.isMaximized(),
      fullScreen: mainWindow.isFullScreen(),
    });
  };
  mainWindow.on('maximize', notifyWindowState);
  mainWindow.on('unmaximize', notifyWindowState);
  mainWindow.on('enter-full-screen', notifyWindowState);
  mainWindow.on('leave-full-screen', notifyWindowState);
  mainWindow.on('ready-to-show', notifyWindowState);

  mainWindow.once('ready-to-show', () => {
    if (settings.startMinimized) {
      mainWindow?.minimize();
    } else {
      mainWindow?.show();
    }
  });

  // Closing hides to tray instead of quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ==================== Tray ====================

function buildTrayMenu(): Menu {
  const translate = t();
  return Menu.buildFromTemplate([
    { label: translate('tray.show'), click: showMainWindow },
    { type: 'separator' },
    {
      label: translate('tray.clean'),
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send('trigger-cleanup');
      },
    },
    {
      label: translate('tray.settings'),
      click: () => {
        showMainWindow();
        mainWindow?.webContents.send('open-settings');
      },
    },
    { type: 'separator' },
    {
      label: translate('tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
  tray.setToolTip(`${app.getName()} v${app.getVersion()}`);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  refreshTrayMenu();
  tray.on('double-click', showMainWindow);
}

// ==================== Settings side effects ====================

/**
 * Apply the settings that have effects outside the renderer. Called both at
 * startup and whenever the renderer saves, so the OS state always matches.
 */
function applySystemSettings(settings: AppSettings): void {
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  mainWindow?.setAlwaysOnTop(settings.alwaysOnTop);
}

// ==================== IPC ====================

function registerIpcHandlers(): void {
  // ---- Window controls ----
  ipcMain.on('window-minimize', () => mainWindow?.minimize());

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });

  ipcMain.on('window-close', () => mainWindow?.hide());

  ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

  // ---- App metadata ----
  ipcMain.handle('app-get-version', () => ({
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }));

  // ---- Locale ----
  ipcMain.on('locale-set', (_event, code: unknown) => {
    if (!isLocaleCode(code)) return;
    setLocale(code as LocaleCode);
    refreshTrayMenu();
  });

  // ---- Persistence ----
  ipcMain.handle('store-load', (): PersistedState => loadState());

  ipcMain.handle('store-save-settings', (_event, settings: AppSettings) => {
    saveSettings(settings);
    applySystemSettings(settings);
  });

  ipcMain.handle('store-save-cleanup', (_event, config) => {
    saveCleanupConfig(config);
  });

  ipcMain.handle('store-save-auto-clean', (_event, config: AutoCleanConfig) => {
    saveAutoClean(config);
  });

  ipcMain.handle('store-add-log', (_event, entry: CleanupLogEntry) => addLog(entry));

  ipcMain.handle('store-clear-logs', () => clearLogs());

  ipcMain.handle('store-reset', (): PersistedState => {
    const state = resetState();
    applySystemSettings(state.settings);
    return state;
  });

  // ---- Memory (real data) ----
  ipcMain.handle('memory-get-info', () => getMemoryInfo(t()));

  ipcMain.handle('memory-get-diagnostics', () => getDiagnostics(t()));

  ipcMain.handle('memory-cleanup', async (event, areas: CleanupArea[]) => {
    return cleanupMemory(areas, t(), (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('cleanup-progress', progress);
      }
    });
  });
}

// ==================== Lifecycle ====================

function initialize(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', showMainWindow);

  // Resolve the locale first: the tray menu and window title depend on it.
  const settings = getSettings();
  initLocale(settings);

  registerIpcHandlers();
  applySystemSettings(settings);

  createMainWindow(settings);
  createTray();
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow(getSettings());
  else showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Surface unexpected failures instead of dying silently.
process.on('uncaughtException', (error) => {
  dialog.showErrorBox('Fluent Reduct', error.stack || error.message);
});

