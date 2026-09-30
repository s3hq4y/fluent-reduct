/**
 * Fluent Reduct - renderer entry point.
 *
 * Wires the DOM to the main process: memory readouts, cleanup, settings and the
 * cleanup log. All persisted state lives in the main process, so this module
 * loads it once during initialization instead of touching localStorage.
 */

import {
  CLEANUP_AREA_ORDER,
  DEFAULT_CLEANUP_AREAS_LIST,
  STANDBY_PURGE_AREAS,
} from '../../shared/cleanup';
import { ACCENT_COLORS } from '../../shared/theme';
import {
  AUTO_CLEAN_LIMITS,
  clampNumberInput,
} from '../../shared/settings';
import {
  createTranslator,
  type LocaleCode,
  type Translator,
} from '../../shared/i18n/translate';
import { SUPPORTED_LOCALES } from '../../shared/i18n/translate';
import type {
  AppSettings,
  AutoCleanConfig,
  CleanupArea,
  CleanupConfig,
  CleanupLogEntry,
  CleanupLogStatus,
  CleanupResult,
  MemoryInfo,
  PersistedState,
  ThemeMode,
} from '../../shared/types';
import { AreaSelector } from './components/area-selector';
import { ConfirmDialog } from './components/confirm-dialog';
import { LogList } from './components/log-list';
import { ToastManager } from './components/toast';
import { applyDocumentLanguage, applyStaticTranslations, resolveUiLocale } from './utils/i18n';
import { formatBytes, formatFreeTotal } from '../../shared/format';
import { MemoryMonitor } from './utils/memory';
import { themeManager } from './utils/theme';

// ==================== DOM helpers ====================

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

/** Minimum time between two cleanups, regardless of trigger. */
const CLEANUP_THROTTLE_MS = 1000;

// ==================== Application ====================

class Application {
  private state!: PersistedState;
  private t!: Translator;
  private locale!: LocaleCode;
  private monitor!: MemoryMonitor;
  private areaSelector!: AreaSelector;
  private logList!: LogList;
  private toasts!: ToastManager;
  private confirmDialog!: ConfirmDialog;

  private isCleaning = false;
  private lastCleanupAt = 0;
  private dataSourceWarned = false;

  /** Boot the UI. Persisted state is fetched before anything is rendered. */
  async start(): Promise<void> {
    const api = window.electronAPI;
    if (!api) throw new Error('Preload bridge unavailable');

    this.state = await api.store.load();
    this.locale = resolveUiLocale(this.state.settings.language);
    this.t = createTranslator(this.locale);

    applyDocumentLanguage(this.locale);
    applyStaticTranslations(this.t);
    themeManager.init(this.state.settings.theme);

    this.toasts = new ToastManager(byId('toast-container'));
    this.confirmDialog = new ConfirmDialog();
    this.logList = new LogList({ list: byId('logs-list'), empty: byId('logs-empty') }, this.t);
    this.areaSelector = new AreaSelector({
      container: byId('cleanup-areas'),
      t: this.t,
      onChange: () => this.onAreaSelectionChanged(),
    });

    this.monitor = new MemoryMonitor(this.t);

    this.renderVersion();
    this.renderLogs();
    this.renderSettingsForm();
    this.applyCleanupMode(this.state.cleanupConfig.mode, false);
    this.bindEvents();
    this.bindMainEvents();

    this.monitor.memoryInfo.subscribe((info) => this.onMemoryUpdate(info));
    this.monitor.start(1000);

    this.applySettingsSideEffects(this.state.settings);
    void this.reportDiagnostics();
  }

  // ==================== Memory readouts ====================

  private onMemoryUpdate(info: MemoryInfo): void {
    this.updateCard('physical', info.physical);
    this.updateCard('pagefile', info.pagefile);
    this.updateCard('cache', info.systemCache);
    this.updateStatusBadge(info);
    this.checkAutoClean(info.physical.percent);

    if (info.source !== 'native' && !this.dataSourceWarned) {
      this.dataSourceWarned = true;
      this.toasts.show({
        title: this.t('toast.dataIncomplete.title'),
        message: info.error ?? this.t('toast.dataIncomplete.message'),
        type: 'warning',
        duration: 6000,
      });
    }
  }

  private updateCard(prefix: 'physical' | 'pagefile' | 'cache', region: MemoryInfo['physical']): void {
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (region.percent / 100) * circumference;

    const ring = document.getElementById(`ring-${prefix}`);
    if (ring) ring.style.strokeDashoffset = String(offset);

    const percent = document.getElementById(`percent-${prefix}`);
    if (percent) percent.textContent = `${region.percentFormatted}%`;

    const memory = document.getElementById(`mem-${prefix}`);
    if (memory) memory.textContent = formatFreeTotal(region.free, region.total);
  }

  private updateStatusBadge(info: MemoryInfo): void {
    const badge = byId('status-badge');
    const dot = badge.querySelector<HTMLElement>('.status-dot');
    const label = badge.querySelector<HTMLElement>('.status-text');
    const percent = info.physical.percent;
    const { warningLevel, dangerLevel } = this.state.settings;

    const [color, text] =
      percent >= dangerLevel
        ? ['var(--color-danger)', this.t('status.danger')]
        : percent >= warningLevel
          ? ['var(--color-warning)', this.t('status.warning')]
          : ['var(--color-success)', this.t('status.normal')];

    if (dot) dot.style.background = color;
    if (label) label.textContent = text;

    const summary = byId('status-memory');
    summary.textContent =
      info.source === 'native'
        ? this.t('status.memory', { percent: info.physical.percentFormatted })
        : this.t('status.memoryDegraded', { percent: info.physical.percentFormatted });
  }

  private async reportDiagnostics(): Promise<void> {
    const diagnostics = await this.monitor.getDiagnostics();
    if (!diagnostics.nativeAvailable) {
      this.toasts.show({
        title: this.t('toast.nativeUnavailable.title'),
        message: diagnostics.error ?? this.t('toast.nativeUnavailable.message'),
        type: 'error',
        duration: 8000,
      });
    } else if (!diagnostics.elevated) {
      this.toasts.show({
        title: this.t('toast.notElevated.title'),
        message: this.t('toast.notElevated.message'),
        type: 'warning',
        duration: 7000,
      });
    }
  }

  private renderVersion(): void {
    void window.electronAPI?.system.getVersion().then((version) => {
      const title = this.t('app.title', { name: this.t('app.name'), version: version.app });
      byId('app-title').textContent = title;
      document.title = title;
    });
  }

  // ==================== Cleanup ====================

  private onAreaSelectionChanged(): void {
    if (this.state.cleanupConfig.mode !== 'custom') return;
    this.persistCustomAreas();
  }

  /**
   * Areas to clean for the current mode.
   *
   * Auto cleanup additionally purges the standby list when the user allowed it;
   * a manual run always uses exactly what the profile shows.
   */
  private selectedAreas(auto: boolean): CleanupArea[] {
    const base =
      this.state.cleanupConfig.mode === 'default'
        ? [...DEFAULT_CLEANUP_AREAS_LIST]
        : this.areaSelector.getChecked();

    if (!auto || !this.state.settings.allowStandbyList) return base;

    const selected = new Set(base);
    for (const area of STANDBY_PURGE_AREAS) selected.add(area);
    return CLEANUP_AREA_ORDER.filter((area) => selected.has(area));
  }

  private applyCleanupMode(mode: CleanupConfig['mode'], persist: boolean): void {
    document.querySelectorAll<HTMLElement>('.mode-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });

    const readOnly = mode === 'default';
    this.areaSelector.setReadOnly(readOnly);

    // Default mode shows its fixed areas read-only; custom mode restores the saved selection.
    if (readOnly) {
      this.areaSelector.setChecked(DEFAULT_CLEANUP_AREAS_LIST);
    } else {
      this.areaSelector.setAreas(this.state.cleanupConfig.areas);
    }

    this.state.cleanupConfig = { ...this.state.cleanupConfig, mode };
    if (persist) void window.electronAPI?.store.saveCleanupConfig(this.state.cleanupConfig);
  }

  private persistCustomAreas(): void {
    const areas = this.areaSelector.getAreaMap();
    this.state.cleanupConfig = { mode: 'custom', areas };
    void window.electronAPI?.store.saveCleanupConfig(this.state.cleanupConfig);
  }

  /**
   * Manual cleanup entry point: ask first when the confirmation option is on.
   *
   * `skipConfirmation` is used by the floating ball. Its double-click is already
   * an explicit action, and the confirmation dialog lives in this window, which
   * a ball-initiated run must never reveal.
   */
  private async requestCleanup(skipConfirmation = false): Promise<void> {
    if (this.state.settings.confirmClean && !skipConfirmation) {
      const confirmed = await this.confirmDialog.ask({
        message: this.t('confirm.clean'),
        confirmLabel: this.t('btn.ok'),
        cancelLabel: this.t('btn.cancel'),
      });
      if (!confirmed) {
        // Release the ball's busy state: nothing will run, so no other event
        // will arrive to clear it.
        window.electronAPI?.memory.notifyCleanupFinished(0);
        return;
      }
    }
    await this.performCleanup(false);
  }

  private async requestClearLogs(): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      message: this.t('confirm.clearLogs'),
      confirmLabel: this.t('btn.ok'),
      cancelLabel: this.t('btn.cancel'),
    });
    if (confirmed) await this.clearLogs();
  }

  private async requestReset(): Promise<void> {
    const confirmed = await this.confirmDialog.ask({
      message: this.t('confirm.reset'),
      confirmLabel: this.t('btn.ok'),
      cancelLabel: this.t('btn.cancel'),
    });
    if (confirmed) await this.resetAll();
  }

  private async performCleanup(auto: boolean): Promise<void> {
    // A run is already in flight; its own completion releases the ball.
    if (this.isCleaning) return;

    const areas = this.selectedAreas(auto);
    if (areas.length === 0) {
      this.toasts.show({
        title: this.t('toast.hint'),
        message: this.t('toast.selectArea'),
        type: 'warning',
      });
      window.electronAPI?.memory.notifyCleanupFinished(0);
      return;
    }

    this.isCleaning = true;
    this.lastCleanupAt = Date.now();
    // Reported to the ball on every exit path so it always stops showing progress.
    let freed = 0;

    const progressModal = byId('modal-progress');
    const progressFill = byId('progress-fill');
    const progressText = byId('progress-text');
    const cleanButton = byId<HTMLButtonElement>('btn-clean');

    progressModal.style.display = 'flex';
    cleanButton.disabled = true;
    byId('status-text').textContent = this.t('status.cleaning');
    progressFill.style.width = '0%';
    progressText.textContent = this.t('progress.preparing');

    const unsubscribe = window.electronAPI?.on.cleanupProgress((progress) => {
      const percent = Math.round((progress.index / progress.total) * 100);
      progressFill.style.width = `${percent}%`;
      progressText.textContent = this.t('progress.item', {
        label: progress.label,
        index: progress.index + 1,
        total: progress.total,
      });
    });

    try {
      const result = await this.monitor.cleanup(areas);
      freed = result.freedMemory;
      progressFill.style.width = '100%';
      progressText.textContent = this.t('progress.done');
      await this.recordCleanup(result, areas.length, auto);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendLog({
        freed: 0,
        durationSec: 0,
        areasCount: areas.length,
        okCount: 0,
        failCount: areas.length,
        percentBefore: 0,
        percentAfter: 0,
        status: 'failed',
        message,
        auto,
      });
      this.toasts.show({
        title: this.t('toast.cleanFailed.title'),
        message,
        type: 'error',
      });
    } finally {
      unsubscribe?.();
      progressModal.style.display = 'none';
      cleanButton.disabled = false;
      byId('status-text').textContent = this.t('status.ready');
      this.isCleaning = false;
      // Release the floating ball's busy state and let it report the result.
      window.electronAPI?.memory.notifyCleanupFinished(freed);
    }
  }

  private async recordCleanup(
    result: CleanupResult,
    areaCount: number,
    auto: boolean
  ): Promise<void> {
    const succeeded = result.areaResults.filter((entry) => entry.ok);
    const failed = result.areaResults.filter((entry) => !entry.ok);
    const status: CleanupLogStatus =
      failed.length === 0 ? 'success' : succeeded.length === 0 ? 'failed' : 'partial';

    await this.appendLog({
      freed: result.freedMemory,
      durationSec: result.duration,
      areasCount: areaCount,
      okCount: succeeded.length,
      failCount: failed.length,
      percentBefore: result.before.physical.percentFormatted,
      percentAfter: result.after.physical.percentFormatted,
      status,
      message: failed.length > 0 ? failed.map((entry) => entry.message).join('; ') : undefined,
      auto,
    });

    if (!this.state.settings.showResult) return;

    if (failed.length === 0) {
      this.toasts.show({
        title: this.t('toast.cleanDone.title'),
        message: this.t('toast.cleanDone.message', {
          freed: formatBytes(result.freedMemory),
          seconds: result.duration.toFixed(1),
        }),
        type: 'success',
      });
      return;
    }

    if (succeeded.length === 0) {
      this.toasts.show({
        title: this.t('toast.cleanFailed.title'),
        message: result.elevated
          ? failed[0].message
          : this.t('toast.cleanFailed.noAdmin'),
        type: 'error',
        duration: 7000,
      });
      return;
    }

    this.toasts.show({
      title: this.t('toast.cleanPartial.title'),
      message: this.t('toast.cleanPartial.message', {
        freed: formatBytes(result.freedMemory),
        count: failed.length,
        details: failed.map((entry) => entry.message).join('; '),
      }),
      type: 'warning',
      duration: 8000,
    });
  }

  private checkAutoClean(percent: number): void {
    const config = this.state.autoClean;
    if (!config.enabled || this.isCleaning) return;

    const intervalMs = config.interval * 60 * 1000;
    if (percent < config.threshold) return;
    if (Date.now() - this.lastCleanupAt < Math.max(intervalMs, CLEANUP_THROTTLE_MS)) return;

    void this.performCleanup(true);
  }

  // ==================== Cleanup log ====================

  private renderLogs(): void {
    this.logList.render(this.state.logs);
  }

  private async appendLog(entry: Omit<CleanupLogEntry, 'id' | 'time'>): Promise<void> {
    if (!this.state.settings.logResults) return;

    const full: CleanupLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: Date.now(),
    };

    const logs = await window.electronAPI?.store.addLog(full);
    if (logs) {
      this.state.logs = logs;
      this.renderLogs();
    }
  }

  private async clearLogs(): Promise<void> {
    await window.electronAPI?.store.clearLogs();
    this.state.logs = [];
    this.renderLogs();
  }

  // ==================== Settings ====================

  private renderSettingsForm(): void {
    const settings = this.state.settings;

    this.renderLanguageOptions();
    this.renderColorPicker(settings.theme.accentColor);

    document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.theme === settings.theme.mode);
    });

    const checkboxes: Array<[string, boolean]> = [
      ['setting-always-top', settings.alwaysOnTop],
      ['setting-startup', settings.launchAtLogin],
      ['setting-start-minimized', settings.startMinimized],
      ['setting-confirm', settings.confirmClean],
      ['setting-show-result', settings.showResult],
      ['setting-log', settings.logResults],
      ['setting-allow-standby', settings.allowStandbyList],
      ['setting-floating-ball', settings.floatingBall.enabled],
    ];
    for (const [id, value] of checkboxes) {
      byId<HTMLInputElement>(id).checked = value;
    }

    const auto = this.state.autoClean;
    byId<HTMLInputElement>('setting-auto-clean').checked = auto.enabled;
    byId<HTMLInputElement>('setting-threshold').value = String(auto.threshold);
    byId<HTMLInputElement>('setting-interval').value = String(auto.interval);
    this.syncAutoCleanInputs();
  }

  private renderLanguageOptions(): void {
    const select = byId<HTMLSelectElement>('setting-language');
    select.replaceChildren();

    const systemOption = document.createElement('option');
    systemOption.value = 'system';
    systemOption.textContent = this.t('theme.system');
    select.appendChild(systemOption);

    for (const { code, label } of SUPPORTED_LOCALES) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = label;
      select.appendChild(option);
    }

    select.value = this.state.settings.language;
  }

  private renderColorPicker(activeColor: string): void {
    const picker = byId('color-picker');
    picker.replaceChildren();

    for (const color of ACCENT_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `color-swatch${color.value === activeColor ? ' active' : ''}`;
      swatch.style.background = color.value;
      swatch.title = this.t(color.labelKey);
      swatch.setAttribute('aria-label', this.t(color.labelKey));
      swatch.addEventListener('click', () => this.setAccentColor(color.value));
      picker.appendChild(swatch);
    }

    byId<HTMLInputElement>('custom-color').value = activeColor;
  }

  private setAccentColor(color: string): void {
    themeManager.setAccentColor(color);
    this.state.settings.theme = { ...this.state.settings.theme, accentColor: color };
    this.renderColorPicker(color);
  }

  private setThemeMode(mode: ThemeMode): void {
    themeManager.setMode(mode);
    this.state.settings.theme = { ...this.state.settings.theme, mode };
    document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.theme === mode);
    });
  }

  private syncAutoCleanInputs(): void {
    const enabled = byId<HTMLInputElement>('setting-auto-clean').checked;
    byId<HTMLInputElement>('setting-threshold').disabled = !enabled;
    byId<HTMLInputElement>('setting-interval').disabled = !enabled;
  }

  private async saveSettings(): Promise<void> {
    const previousLanguage = this.state.settings.language;

    const settings: AppSettings = {
      ...this.state.settings,
      language: byId<HTMLSelectElement>('setting-language').value as AppSettings['language'],
      alwaysOnTop: byId<HTMLInputElement>('setting-always-top').checked,
      launchAtLogin: byId<HTMLInputElement>('setting-startup').checked,
      startMinimized: byId<HTMLInputElement>('setting-start-minimized').checked,
      confirmClean: byId<HTMLInputElement>('setting-confirm').checked,
      showResult: byId<HTMLInputElement>('setting-show-result').checked,
      logResults: byId<HTMLInputElement>('setting-log').checked,
      allowStandbyList: byId<HTMLInputElement>('setting-allow-standby').checked,
      floatingBall: {
        ...this.state.settings.floatingBall,
        enabled: byId<HTMLInputElement>('setting-floating-ball').checked,
      },
    };

    const autoClean: AutoCleanConfig = {
      enabled: byId<HTMLInputElement>('setting-auto-clean').checked,
      threshold: clampNumberInput(
        byId<HTMLInputElement>('setting-threshold').value,
        this.state.autoClean.threshold,
        AUTO_CLEAN_LIMITS.threshold.min,
        AUTO_CLEAN_LIMITS.threshold.max
      ),
      interval: clampNumberInput(
        byId<HTMLInputElement>('setting-interval').value,
        this.state.autoClean.interval,
        AUTO_CLEAN_LIMITS.interval.min,
        AUTO_CLEAN_LIMITS.interval.max
      ),
    };

    this.state.settings = settings;
    this.state.autoClean = autoClean;

    await window.electronAPI?.store.saveSettings(settings);
    await window.electronAPI?.store.saveAutoClean(autoClean);

    // Normalize the inputs back to the persisted values.
    byId<HTMLInputElement>('setting-threshold').value = String(autoClean.threshold);
    byId<HTMLInputElement>('setting-interval').value = String(autoClean.interval);
    this.syncAutoCleanInputs();
    this.applySettingsSideEffects(settings);

    // A language change re-renders every string, so reload into the new locale.
    if (settings.language !== previousLanguage) {
      window.location.reload();
      return;
    }

    this.closeSettings();
    this.toasts.show({
      title: this.t('toast.settingsSaved.title'),
      message: this.t('toast.settingsSaved.message'),
      type: 'success',
    });
  }

  /**
   * Apply settings that affect this process. `alwaysOnTop` and `launchAtLogin`
   * are applied by the main process when it persists them.
   */
  private applySettingsSideEffects(settings: AppSettings): void {
    themeManager.init(settings.theme);
  }

  private async resetAll(): Promise<void> {
    const state = await window.electronAPI?.store.reset();
    if (state) window.location.reload();
  }

  private openSettings(): void {
    byId('modal-settings').style.display = 'flex';
    this.renderSettingsForm();
  }

  private closeSettings(): void {
    byId('modal-settings').style.display = 'none';
  }

  // ==================== Events ====================

  private bindEvents(): void {
    const api = window.electronAPI;

    byId('btn-minimize').addEventListener('click', () => api?.window.minimize());
    byId('btn-maximize').addEventListener('click', () => api?.window.maximize());
    byId('btn-close').addEventListener('click', () => api?.window.close());

    byId('btn-clean').addEventListener('click', () => void this.requestCleanup());

    byId('btn-settings').addEventListener('click', () => this.openSettings());
    byId('btn-settings-close').addEventListener('click', () => this.closeSettings());
    byId('btn-settings-cancel').addEventListener('click', () => this.closeSettings());
    byId('btn-settings-save').addEventListener('click', () => void this.saveSettings());

    byId('btn-clear-logs').addEventListener('click', () => void this.requestClearLogs());

    byId('btn-reset').addEventListener('click', () => void this.requestReset());

    document.querySelectorAll<HTMLElement>('.theme-btn').forEach((button) => {
      button.addEventListener('click', () => {
        this.setThemeMode(button.dataset.theme as ThemeMode);
      });
    });

    byId<HTMLInputElement>('custom-color').addEventListener('input', (event) => {
      this.setAccentColor((event.target as HTMLInputElement).value);
    });

    document.querySelectorAll<HTMLElement>('.mode-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode as CleanupConfig['mode'];
        if (this.state.cleanupConfig.mode === 'custom' && mode !== 'custom') {
          this.persistCustomAreas();
        }
        this.applyCleanupMode(mode, true);
      });
    });

    byId('setting-auto-clean').addEventListener('change', () => this.syncAutoCleanInputs());

    document.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
      tab.addEventListener('click', () => this.activateTab(tab.dataset.tab));
    });
  }

  private activateTab(tabId: string | undefined): void {
    if (!tabId) return;
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
  }

  private bindMainEvents(): void {
    const api = window.electronAPI;
    if (!api) return;

    // The tray reveals this window first, so it keeps the confirmation prompt;
    // a ball-initiated run skips it and stays invisible.
    api.on.triggerCleanup((trigger) => void this.requestCleanup(trigger.skipConfirmation));
    api.on.openSettings(() => this.openSettings());
    api.on.windowStateChange((state) => this.syncWindowState(state));

    void api.window.isMaximized().then((maximized) => {
      this.syncWindowState({ maximized, fullScreen: false });
    });

    api.locale.set(this.locale);

    this.startClock();
  }

  private syncWindowState(state: { maximized: boolean; fullScreen: boolean }): void {
    const maximized = state.maximized || state.fullScreen;
    document.body.classList.toggle('is-maximized', maximized);

    const button = byId('btn-maximize');
    const label = maximized ? this.t('window.restore') : this.t('window.maximize');
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  private startClock(): void {
    const time = byId('status-time');
    const tick = (): void => {
      time.textContent = new Date().toLocaleTimeString(undefined, { hour12: false });
    };
    tick();
    window.setInterval(tick, 1000);
  }
}

// ==================== Bootstrap ====================

async function bootstrap(): Promise<void> {
  try {
    await new Application().start();
  } catch (error) {
    // Without the preload bridge nothing can work; show the failure rather than
    // leaving a silently dead window.
    const message = error instanceof Error ? error.message : String(error);
    document.body.textContent = message;
    console.error('[fluent-reduct] initialization failed', error);
  }
}

document.addEventListener('DOMContentLoaded', () => void bootstrap());
