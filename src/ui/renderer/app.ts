/**
 * Fluent Reduct - Renderer process entry
 */

import type {
  MemoryInfo, MemoryRegion, CleanupArea, CleanupConfig, AppSettings,
  AutoCleanConfig, CleanupLogEntry, CleanupLogStatus,
  ToastOptions, ToastType, ThemeMode
} from './types';
import { themeManager, ACCENT_COLORS } from './utils/theme';
import { memoryMonitor } from './utils/memory';
import {
  storage, DEFAULT_SETTINGS, DEFAULT_CLEANUP, DEFAULT_AUTO_CLEAN,
} from './utils/storage';
import { createState, type State } from './utils/state';

// ==================== Application state ====================

const settings: State<AppSettings> = createState(storage.getSettings());
const cleanupConfig: State<CleanupConfig> = createState(storage.getCleanupConfig());
const autoClean: State<AutoCleanConfig> = createState(storage.getAutoCleanConfig());
let cleanupLogs: CleanupLogEntry[] = storage.getCleanupLogs();

// Auto-clean throttle: minimum interval since the last (manual or auto) cleanup
let lastCleanupAt = 0;
// Whether a cleanup is running (prevents concurrent manual/auto triggers)
let isCleaning = false;

// Cleanup elements included in the default mode (kept in sync with DEFAULT_CLEANUP)
const DEFAULT_AREAS: CleanupArea[] = [
  'workingset',
  'systemfilecache',
  'standbypriority0',
  'modifiedfilecache',
  'registrycache',
  'combinememory',
];

// ==================== Cached DOM elements ====================

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const els = {
  // Ring charts
  ringPhysical: $('ring-physical'),
  ringPagefile: $('ring-pagefile'),
  ringCache: $('ring-cache'),

  // In-ring text (line 1: usage percent)
  percentPhysical: $('percent-physical'),
  percentPagefile: $('percent-pagefile'),
  percentCache: $('percent-cache'),

  // In-ring text (line 2: free/total)
  memPhysical: $('mem-physical'),
  memPagefile: $('mem-pagefile'),
  memCache: $('mem-cache'),

  // Status
  statusBadge: $('status-badge'),
  statusText: $('status-text'),
  statusMemory: $('status-memory'),
  statusTime: $('status-time'),

  // Cleanup log
  logsList: $('logs-list'),
  logsEmpty: $('logs-empty'),
  btnClearLogs: $('btn-clear-logs'),

  // Title
  appTitle: $('app-title'),

  // Buttons
  btnClean: $('btn-clean'),
  btnSettings: $('btn-settings'),
  btnMinimize: $('btn-minimize'),
  btnMaximize: $('btn-maximize'),
  btnClose: $('btn-close'),

  // Modals
  modalSettings: $('modal-settings'),
  modalProgress: $('modal-progress'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),

  // Settings
  btnSettingsClose: $('btn-settings-close'),
  btnSettingsCancel: $('btn-settings-cancel'),
  btnSettingsSave: $('btn-settings-save'),
  btnReset: $('btn-reset'),

  // Auto-clean
  settingAutoClean: $('setting-auto-clean') as HTMLInputElement,
  settingThreshold: $('setting-threshold') as HTMLInputElement,
  settingInterval: $('setting-interval') as HTMLInputElement,

  // Accent color
  colorPicker: $('color-picker'),
  customColor: $('custom-color') as HTMLInputElement,

  // Toasts
  toastContainer: $('toast-container'),
};

// ==================== Utility functions ====================

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Ring line 2: free/total using the same unit, with no text labels.
 * e.g. "12.3/15.9 GB".
 */
function formatFreeTotal(free: number, total: number): string {
  if (!total || total <= 0) return '0/0 GB';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(total) / Math.log(k)));
  const f = (b: number) => (b / Math.pow(k, i)).toFixed(1);
  return `${f(free)}/${f(total)} ${units[i]}`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== UI updates ====================

// Update a memory card: ring line 1 usage percent, line 2 free/total
function updateMemoryCard(
  prefix: string,
  data: MemoryRegion
): void {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (data.percent / 100) * circumference;

  const ring = els[`ring${capitalize(prefix)}` as keyof typeof els] as unknown as SVGCircleElement;
  if (ring) ring.style.strokeDashoffset = offset.toString();

  const percentEl = els[`percent${capitalize(prefix)}` as keyof typeof els];
  if (percentEl) percentEl.textContent = `${data.percentFormatted}%`;

  const memEl = els[`mem${capitalize(prefix)}` as keyof typeof els];
  if (memEl) memEl.textContent = formatFreeTotal(data.free, data.total);
}

// Only warn once about native-interface errors
let dataSourceWarned = false;

// Handle memory info updates
function onMemoryUpdate(info: MemoryInfo): void {
  updateMemoryCard('Physical', info.physical);
  updateMemoryCard('Pagefile', info.pagefile);
  updateMemoryCard('Cache', info.systemCache);

  // Update the status indicator
  const percent = info.physical.percent;
  const statusDot = els.statusBadge.querySelector('.status-dot') as HTMLElement;
  const statusText = els.statusBadge.querySelector('.status-text') as HTMLElement;

  if (percent >= settings.value.dangerLevel) {
    statusDot.style.background = 'var(--color-danger)';
    statusText.textContent = '危险';
  } else if (percent >= settings.value.warningLevel) {
    statusDot.style.background = 'var(--color-warning)';
    statusText.textContent = '警告';
  } else {
    statusDot.style.background = 'var(--color-success)';
    statusText.textContent = '正常';
  }

  // Update the status bar
  if (info.source === 'native') {
    els.statusMemory.textContent = `内存: ${info.physical.percentFormatted}%`;
  } else {
    els.statusMemory.textContent = `内存: ${info.physical.percentFormatted}% (降级读数)`;
  }

  // Warn once when the native interface fails so users don't trust bad data
  if (info.source !== 'native' && !dataSourceWarned) {
    dataSourceWarned = true;
    showToast({
      title: '内存数据不完整',
      message: info.error || '无法调用 Windows 原生接口，部分数值不可用',
      type: 'warning',
      duration: 6000,
    });
  }

  // Check auto-clean
  checkAutoClean(percent);
}

// ==================== Auto-clean ====================

// Check whether auto-clean should run (threshold + interval both come from the editable, live config)
function checkAutoClean(percent: number): void {
  const cfg = autoClean.value;
  if (!cfg.enabled) return;
  if (isCleaning) return;

  const now = Date.now();
  const intervalMs = Math.max(1, cfg.interval) * 60 * 1000;

  if (percent >= cfg.threshold && (now - lastCleanupAt) >= intervalMs) {
    lastCleanupAt = now;
    void performCleanup(true);
  }
}

// ==================== Cleanup log ====================

function renderLogs(): void {
  const list = els.logsList;
  if (!list) return;
  list.innerHTML = '';

  if (cleanupLogs.length === 0) {
    els.logsEmpty.style.display = 'block';
    return;
  }
  els.logsEmpty.style.display = 'none';

  for (const entry of cleanupLogs) {
    const li = document.createElement('li');
    li.className = 'log-entry';

    const dot = document.createElement('span');
    dot.className = `log-entry__dot log-entry__dot--${entry.status}`;
    li.appendChild(dot);

    const time = document.createElement('span');
    time.className = 'log-entry__time';
    time.textContent = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false });
    li.appendChild(time);

    const main = document.createElement('div');
    main.className = 'log-entry__main';

    const line = document.createElement('div');
    line.className = 'log-entry__line';
    const statusLabel = entry.status === 'success' ? '清理完成'
      : entry.status === 'partial' ? '部分完成'
      : '清理失败';
    line.textContent = `${statusLabel}${entry.auto ? ' · 自动' : ''} · ${entry.areasCount} 项 · ${entry.durationSec.toFixed(1)} 秒`;
    main.appendChild(line);

    const detail = document.createElement('div');
    detail.className = 'log-entry__detail';
    const detailParts: string[] = [
      `${entry.percentBefore}% → ${entry.percentAfter}%`,
    ];
    if (entry.failCount > 0) detailParts.push(`${entry.failCount} 项失败`);
    if (entry.message) detailParts.push(entry.message);
    detail.textContent = detailParts.join(' · ');
    main.appendChild(detail);

    li.appendChild(main);

    const freed = document.createElement('span');
    freed.className = 'log-entry__freed';
    freed.textContent = entry.freed > 0 ? formatBytes(entry.freed) : '—';
    li.appendChild(freed);

    list.appendChild(li);
  }
}

function addCleanupLog(entry: Omit<CleanupLogEntry, 'id' | 'time'>): void {
  // Don't write when "log cleanup results" is off (no new history in the UI either)
  if (!settings.value.logResults) return;

  const full: CleanupLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
  };
  cleanupLogs = storage.addCleanupLog(full);
  renderLogs();
}

function clearLogs(): void {
  cleanupLogs = [];
  storage.clearCleanupLogs();
  renderLogs();
}

// ==================== Cleanup ====================

// Get the areas to clean based on the current mode (default is read-only, custom is editable)
function getSelectedAreas(): CleanupArea[] {
  if (cleanupConfig.value.mode === 'default') {
    return [...DEFAULT_AREAS];
  }
  const areas: CleanupArea[] = [];
  document.querySelectorAll('.area-checkbox:checked').forEach(cb => {
    areas.push((cb as HTMLInputElement).dataset.area as CleanupArea);
  });
  return areas;
}

// Sync the checkboxes to the given set of areas
function setAreaCheckboxes(areas: Record<CleanupArea, boolean>): void {
  document.querySelectorAll<HTMLInputElement>('.area-checkbox').forEach(cb => {
    const area = cb.dataset.area as CleanupArea;
    cb.checked = !!areas[area];
  });
}

// Switch between default / custom modes
function applyCleanupMode(mode: 'default' | 'custom', persist: boolean): void {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.mode === mode);
  });

  const areasEl = document.getElementById('cleanup-areas');
  if (areasEl) {
    areasEl.style.display = 'block';
    // Default mode: show which elements are included, but read-only
    areasEl.classList.toggle('is-readonly', mode === 'default');
  }

  if (mode === 'default') {
    // Default mode: check the fixed default elements
    setAreaCheckboxes({ ...DEFAULT_CLEANUP.areas });
  } else {
    // Custom mode: restore the user's saved selection
    setAreaCheckboxes({ ...cleanupConfig.value.areas });
  }

  cleanupConfig.value = { ...cleanupConfig.value, mode };
  if (persist) {
    storage.saveCleanupConfig(cleanupConfig.value);
  }
}

// Read the checkbox state in custom mode and persist it
function persistCustomAreas(): void {
  const areas = { ...cleanupConfig.value.areas };
  document.querySelectorAll<HTMLInputElement>('.area-checkbox').forEach(cb => {
    const area = cb.dataset.area as CleanupArea;
    areas[area] = cb.checked;
  });
  cleanupConfig.value = { mode: 'custom', areas };
  storage.saveCleanupConfig(cleanupConfig.value);
}

async function performCleanup(auto: boolean = false): Promise<void> {
  if (isCleaning) return;

  const areas = getSelectedAreas();
  if (areas.length === 0) {
    showToast({ title: '提示', message: '请至少选择一个清理区域', type: 'warning' });
    return;
  }

  isCleaning = true;

  // Show progress
  els.modalProgress.style.display = 'flex';
  (els.btnClean as HTMLButtonElement).disabled = true;
  els.statusText.textContent = '正在清理内存...';
  els.progressFill.style.width = '0%';
  els.progressText.textContent = '准备清理...';

  // Real progress: pushed area-by-area from the main process
  const unsubscribeProgress = window.electronAPI?.on.cleanupProgress((progress) => {
    const pct = Math.round((progress.index / progress.total) * 100);
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `正在清理 ${progress.label}... (${progress.index + 1}/${progress.total})`;
  });

  let result;
  try {
    result = await memoryMonitor.cleanup(areas);
    els.progressFill.style.width = '100%';
    els.progressText.textContent = '清理完成';
  } catch (error) {
    // The call itself failed (e.g. not connected to the main process)
    addCleanupLog({
      freed: 0,
      durationSec: 0,
      areasCount: areas.length,
      okCount: 0,
      failCount: areas.length,
      percentBefore: 0,
      percentAfter: 0,
      status: 'failed',
      message: String(error),
      auto,
    });
    showToast({ title: '清理失败', message: String(error), type: 'error' });
    unsubscribeProgress?.();
    els.modalProgress.style.display = 'none';
    (els.btnClean as HTMLButtonElement).disabled = false;
    els.statusText.textContent = '就绪';
    isCleaning = false;
    return;
  }

  const succeeded = result.areaResults.filter(r => r.ok);
  const failed = result.areaResults.filter(r => !r.ok);

  const status: CleanupLogStatus =
    failed.length === 0 ? 'success' : succeeded.length === 0 ? 'failed' : 'partial';

  // Write to the cleanup log (always visible in the UI; recording is gated by the log toggle)
  addCleanupLog({
    freed: result.freedMemory,
    durationSec: result.duration,
    areasCount: areas.length,
    okCount: succeeded.length,
    failCount: failed.length,
    percentBefore: Math.round(result.before.physical.percentFormatted),
    percentAfter: Math.round(result.after.physical.percentFormatted),
    status,
    message: failed.length > 0 ? failed.map(f => f.message).join('；') : undefined,
    auto,
  });

  // Don't pop a result toast when "show cleanup results" is off
  if (settings.value.showResult) {
    if (failed.length === 0) {
      showToast({
        title: '清理完成',
        message: `已释放 ${formatBytes(result.freedMemory)} 物理内存，用时 ${result.duration.toFixed(1)} 秒`,
        type: 'success',
      });
    } else if (succeeded.length === 0) {
      showToast({
        title: '清理失败',
        message: result.elevated
          ? failed[0].message
          : '需要以管理员身份运行才能清理内存',
        type: 'error',
        duration: 7000,
      });
    } else {
      showToast({
        title: '部分区域清理失败',
        message: `已释放 ${formatBytes(result.freedMemory)}；失败 ${failed.length} 项：${failed.map(f => f.message).join('；')}`,
        type: 'warning',
        duration: 8000,
      });
    }
  }

  if (settings.value.logResults) {
    console.log('[cleanup]', result);
  }

  unsubscribeProgress?.();
  els.modalProgress.style.display = 'none';
  (els.btnClean as HTMLButtonElement).disabled = false;
  els.statusText.textContent = '就绪';
  isCleaning = false;
}

// ==================== Settings ====================

function openSettings(): void {
  els.modalSettings.style.display = 'flex';
  loadSettingsForm();
}

function closeSettings(): void {
  els.modalSettings.style.display = 'none';
}

// Enable/disable the two number inputs based on the auto-clean checkbox
function syncAutoCleanInputs(): void {
  const enabled = els.settingAutoClean.checked;
  els.settingThreshold.disabled = !enabled;
  els.settingInterval.disabled = !enabled;
}

function loadSettingsForm(): void {
  const s = settings.value;

  // Theme
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === s.theme.mode);
  });

  // Accent color
  renderColorPicker(s.theme.accentColor);

  // Other settings
  const setCheck = (id: string, value: boolean) => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.checked = value;
  };

  setCheck('setting-always-top', s.alwaysOnTop);
  setCheck('setting-startup', s.startup);
  setCheck('setting-start-minimized', s.startMinimized);
  setCheck('setting-confirm', s.confirmClean);
  setCheck('setting-show-result', s.showResult);
  setCheck('setting-log', s.logResults);
  setCheck('setting-allow-standby', s.allowStandbyList);

  // Auto-clean (number inputs)
  const ac = autoClean.value;
  els.settingAutoClean.checked = ac.enabled;
  els.settingThreshold.value = String(ac.threshold);
  els.settingInterval.value = String(ac.interval);
  syncAutoCleanInputs();
}

// Read and clamp a number input
function readNumberInput(input: HTMLInputElement, min: number, max: number, fallback: number): number {
  let v = parseInt(input.value, 10);
  if (Number.isNaN(v)) v = fallback;
  return Math.min(max, Math.max(min, v));
}

function saveSettings(): void {
  const s = settings.value;

  // Read form values
  s.alwaysOnTop = ($('setting-always-top') as HTMLInputElement).checked;
  s.startup = ($('setting-startup') as HTMLInputElement).checked;
  s.startMinimized = ($('setting-start-minimized') as HTMLInputElement).checked;
  s.confirmClean = ($('setting-confirm') as HTMLInputElement).checked;
  s.showResult = ($('setting-show-result') as HTMLInputElement).checked;
  s.logResults = ($('setting-log') as HTMLInputElement).checked;
  s.allowStandbyList = ($('setting-allow-standby') as HTMLInputElement).checked;

  settings.value = s;
  storage.saveSettings(s);

  // Auto-clean config: number inputs (threshold 50-95%, interval 1-1440 min), takes effect on save
  const newAuto: AutoCleanConfig = {
    enabled: els.settingAutoClean.checked,
    threshold: readNumberInput(els.settingThreshold, 50, 95, DEFAULT_AUTO_CLEAN.threshold),
    interval: readNumberInput(els.settingInterval, 1, 1440, DEFAULT_AUTO_CLEAN.interval),
    allowStandbyList: autoClean.value.allowStandbyList,
  };
  autoClean.value = newAuto;
  storage.saveAutoCleanConfig(newAuto);
  // Write back the normalized values
  els.settingThreshold.value = String(newAuto.threshold);
  els.settingInterval.value = String(newAuto.interval);
  syncAutoCleanInputs();

  // Apply settings
  if (window.electronAPI) {
    window.electronAPI.window.setAlwaysOnTop(s.alwaysOnTop);
  }

  closeSettings();
  showToast({ title: '设置已保存', message: '您的设置已成功保存', type: 'success' });
}

// ==================== Theme ====================

function renderColorPicker(activeColor: string): void {
  els.colorPicker.innerHTML = '';

  ACCENT_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch ${color.value === activeColor ? 'active' : ''}`;
    swatch.style.background = color.value;
    swatch.title = color.name;
    swatch.addEventListener('click', () => setAccentColor(color.value));
    els.colorPicker.appendChild(swatch);
  });
}

function setAccentColor(color: string): void {
  themeManager.setAccentColor(color);
  els.customColor.value = color;
  renderColorPicker(color);

  settings.update(s => ({
    ...s,
    theme: { ...s.theme, accentColor: color }
  }));
}

function setThemeMode(mode: ThemeMode): void {
  themeManager.setMode(mode);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === mode);
  });

  settings.update(s => ({
    ...s,
    theme: { ...s.theme, mode }
  }));
}

// ==================== Toast notifications ====================

function showToast(options: ToastOptions): void {
  const toast = document.createElement('div');
  toast.className = `toast toast--${options.type}`;

  const icons: Record<ToastType, string> = {
    success: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
    warning: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
    error: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
    info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'
  };

  toast.innerHTML = `
    <svg class="toast__icon" viewBox="0 0 24 24" fill="currentColor">${icons[options.type]}</svg>
    <div class="toast__content">
      <div class="toast__title">${options.title}</div>
      <div class="toast__message">${options.message}</div>
    </div>
    <button class="toast__close">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
      </svg>
    </button>
  `;

  toast.querySelector('.toast__close')?.addEventListener('click', () => toast.remove());
  els.toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), options.duration || 5000);
}

// ==================== Titlebar button state ====================

// Toggle the middle button by window maximized/fullscreen state: show the restore glyph when maximized, otherwise maximize
function syncWindowState(state: { maximized: boolean; fullScreen: boolean }): void {
  const maximized = state.maximized || state.fullScreen;
  document.body.classList.toggle('is-maximized', maximized);
  if (els.btnMaximize) {
    els.btnMaximize.title = maximized ? '还原' : '最大化';
    els.btnMaximize.setAttribute('aria-label', maximized ? '还原' : '最大化');
  }
}

// ==================== Event bindings ====================

function bindEvents(): void {
  // Window controls
  els.btnMinimize?.addEventListener('click', () => window.electronAPI?.window.minimize());
  els.btnMaximize?.addEventListener('click', () => window.electronAPI?.window.maximize());
  els.btnClose?.addEventListener('click', () => window.electronAPI?.window.close());

  // Cleanup
  els.btnClean?.addEventListener('click', () => {
    if (settings.value.confirmClean) {
      if (confirm('确定要清理内存吗？')) {
        void performCleanup(false);
      }
    } else {
      void performCleanup(false);
    }
  });

  // Settings
  els.btnSettings?.addEventListener('click', openSettings);
  els.btnSettingsClose?.addEventListener('click', closeSettings);
  els.btnSettingsCancel?.addEventListener('click', closeSettings);
  els.btnSettingsSave?.addEventListener('click', saveSettings);

  // Cleanup log
  els.btnClearLogs?.addEventListener('click', () => {
    if (confirm('确定清空所有清理日志吗？')) {
      clearLogs();
    }
  });

  // Theme selection
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.theme as ThemeMode;
      setThemeMode(mode);
    });
  });

  // Custom color
  els.customColor?.addEventListener('input', (e) => {
    setAccentColor((e.target as HTMLInputElement).value);
  });

  // Cleanup mode switch: default (read-only) / custom (editable)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as 'default' | 'custom';
      // Persist the current selection before leaving custom mode
      if (cleanupConfig.value.mode === 'custom' && mode !== 'custom') {
        persistCustomAreas();
      }
      applyCleanupMode(mode, true);
    });
  });

  // In custom mode, checkbox changes are saved immediately
  document.querySelectorAll('.area-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cleanupConfig.value.mode === 'custom') {
        persistCustomAreas();
      }
    });
  });

  // Auto-clean: the enable checkbox toggles the number inputs' disabled state
  els.settingAutoClean?.addEventListener('change', syncAutoCleanInputs);

  // Settings tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = (tab as HTMLElement).dataset.tab;

      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`tab-${tabId}`)?.classList.add('active');
    });
  });

  // Reset settings
  els.btnReset?.addEventListener('click', () => {
    if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
      storage.clearAll();
      window.location.reload();
    }
  });

  // Electron events
  if (window.electronAPI) {
    window.electronAPI.on.triggerCleanup(() => performCleanup(false));
    window.electronAPI.on.openSettings(() => openSettings());
    // Update the titlebar middle-button glyph on maximize / restore / fullscreen
    window.electronAPI.on.windowStateChange(syncWindowState);
    // Initial state
    window.electronAPI.window.isMaximized().then((isMax) => {
      syncWindowState({ maximized: isMax, fullScreen: false });
    });
  }
}

// ==================== Initialization ====================

function initialize(): void {
  console.log('Fluent Reduct initializing...');

  // Initialize theme
  themeManager.init(settings.value.theme);

  // Bind events
  bindEvents();

  // Initialize the cleanup mode (default mode shows its elements read-only)
  applyCleanupMode(cleanupConfig.value.mode === 'custom' ? 'custom' : 'default', false);

  // Render the cleanup log
  renderLogs();

  // Start memory monitoring
  memoryMonitor.memoryInfo.subscribe(onMemoryUpdate);
  memoryMonitor.start(1000);

  // Check native interface and privileges at startup to surface capability limits early
  void memoryMonitor.getDiagnostics().then(diag => {
    if (!diag.nativeAvailable) {
      showToast({
        title: '原生接口不可用',
        message: diag.error || '无法加载内存 API，读数与清理功能受限',
        type: 'error',
        duration: 8000,
      });
    } else if (!diag.elevated) {
      showToast({
        title: '未以管理员身份运行',
        message: '内存读数正常，但清理操作需要管理员权限',
        type: 'warning',
        duration: 7000,
      });
    }
  });

  // Start the clock
  setInterval(() => {
    els.statusTime.textContent = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }, 1000);
  els.statusTime.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });

  // Show the app version in the title bar (sourced from the main process)
  if (window.electronAPI?.system) {
    window.electronAPI.system.getVersion().then((v) => {
      const title = `Fluent Reduct ${v.app}`;
      if (els.appTitle) els.appTitle.textContent = title;
      document.title = title;
    }).catch(() => { /* keep static title if the version lookup fails */ });
  }

  console.log('Initialization complete');
}

// Initialize after the page loads
document.addEventListener('DOMContentLoaded', initialize);
