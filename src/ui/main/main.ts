/**
 * Fluent Reduct - Electron main process
 * Handles window management, system tray and IPC communication
 */

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getMemoryInfo, cleanupMemory, getDiagnostics, type CleanupArea } from './memory';

// App constants
const APP_NAME = 'Fluent Reduct';
// User-facing display version (package.json uses the semver build version 1.0.0-alpha.0)
const APP_VERSION = 'Alpha-1.0.0';
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.ico');

// Global references
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// App state
interface AppState {
  isMinimized: boolean;
  isAlwaysOnTop: boolean;
  theme: 'light' | 'dark';
  accentColor: string;
}

const appState: AppState = {
  isMinimized: false,
  isAlwaysOnTop: false,
  theme: 'light',
  accentColor: '#0078d4'
};

/**
 * Create the main window
 */
function createMainWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 480,
    height: 680,
    x: Math.floor((width - 480) / 2),
    y: Math.floor((height - 680) / 2),
    minWidth: 400,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: appState.isAlwaysOnTop,
    skipTaskbar: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // Load the renderer entry
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Notify the renderer on maximize / restore / fullscreen changes so the
  // titlebar button glyph can be toggled accordingly
  const notifyWindowState = () => {
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

  // Show the window once it is ready
  mainWindow.once('ready-to-show', () => {
    if (appState.isMinimized) {
      mainWindow?.minimize();
    } else {
      mainWindow?.show();
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools (development mode)
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * Create the system tray
 */
function createTray(): void {
  // Create the tray icon
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  tray.setToolTip(`${APP_NAME} v${APP_VERSION}`);
  
  // Tray context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: '立即清理内存',
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('trigger-cleanup');
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        mainWindow?.show();
        mainWindow?.webContents.send('open-settings');
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Double-click the tray icon to show the window
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

/**
 * Register IPC handlers
 */
function registerIpcHandlers(): void {
  // Window controls
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow?.hide();
  });

  ipcMain.on('window-quit', () => {
    isQuitting = true;
    app.quit();
  });

  // Get window state
  ipcMain.handle('window-is-maximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });

  // Set window properties
  ipcMain.on('set-always-on-top', (_, value: boolean) => {
    appState.isAlwaysOnTop = value;
    mainWindow?.setAlwaysOnTop(value);
  });

  // Get system info
  ipcMain.handle('get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.getSystemVersion(),
      totalMemory: require('os').totalmem(),
      freeMemory: require('os').freemem(),
      cpus: require('os').cpus().length
    };
  });

  // Open external links
  ipcMain.on('open-external', (_, url: string) => {
    shell.openExternal(url);
  });

  // Open a folder
  ipcMain.on('open-folder', (_, folderPath: string) => {
    shell.openPath(folderPath);
  });

  // Get app paths
  ipcMain.handle('get-app-path', (_, name: string) => {
    return app.getPath(name as any);
  });

  // Get version info
  ipcMain.handle('get-version', () => {
    return {
      app: APP_VERSION,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    };
  });

  // ==================== Memory (real data) ====================

  // Read current memory state
  ipcMain.handle('memory-get-info', () => {
    return getMemoryInfo();
  });

  // Perform memory cleanup; progress is pushed via the cleanup-progress event
  ipcMain.handle('memory-cleanup', async (event, areas: CleanupArea[]) => {
    return cleanupMemory(areas, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('cleanup-progress', progress);
      }
    });
  });

  // Diagnostics for native interface / privileges
  ipcMain.handle('memory-get-diagnostics', () => {
    return getDiagnostics();
  });
}

/**
 * App initialization
 */
function initialize(): void {
  // Single-instance lock
  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Register IPC handlers
  registerIpcHandlers();

  // Create window and tray
  createMainWindow();
  createTray();
}

// App lifecycle
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
