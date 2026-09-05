/**
 * Fluent Reduct - Memory monitor
 *
 * All data comes from the main process' native Windows interfaces
 * (GlobalMemoryStatusEx / GetPerformanceInfo / NtSetSystemInformation); nothing
 * here is simulated. When real data is unavailable, stay empty and report the
 * error rather than fabricating numbers.
 */

import type { MemoryInfo, MemoryRegion, CleanupArea, CleanupResult } from '../types';
import { createState, type State } from './state';

const EMPTY_REGION: MemoryRegion = {
  total: 0,
  used: 0,
  free: 0,
  percent: 0,
  percentFormatted: 0,
};

function emptyInfo(error?: string): MemoryInfo {
  return {
    physical: { ...EMPTY_REGION },
    pagefile: { ...EMPTY_REGION },
    systemCache: { ...EMPTY_REGION },
    source: 'fallback',
    error,
  };
}

const NO_BRIDGE = '未连接到主进程，无法读取真实内存数据';

// Memory monitor class
export class MemoryMonitor {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private intervalMs = 1000;
  private polling = false;

  private _memoryInfo: State<MemoryInfo>;
  private _isRunning: State<boolean>;
  private _error: State<string | null>;

  constructor() {
    this._memoryInfo = createState(emptyInfo());
    this._isRunning = createState(false);
    this._error = createState<string | null>(null);
  }

  // Get memory info state
  get memoryInfo(): State<MemoryInfo> {
    return this._memoryInfo;
  }

  // Get running state
  get isRunning(): State<boolean> {
    return this._isRunning;
  }

  // Most recent read error (null means OK)
  get error(): State<string | null> {
    return this._error;
  }

  // Start monitoring
  start(interval: number = 1000): void {
    if (this._isRunning.value) return;

    this.intervalMs = interval;
    this._isRunning.value = true;
    void this.tick();
  }

  // Stop monitoring
  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this._isRunning.value = false;
  }

  // Refresh once immediately
  async refresh(): Promise<void> {
    await this.update();
  }

  /**
   * Polling schedules the next tick only after the previous one finishes,
   * avoiding request pile-up when IPC is slower than the interval.
   */
  private async tick(): Promise<void> {
    if (!this._isRunning.value) return;

    await this.update();

    if (!this._isRunning.value) return;
    this.timerId = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async update(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const api = window.electronAPI;
      if (!api?.memory) {
        this._error.value = NO_BRIDGE;
        this._memoryInfo.value = emptyInfo(NO_BRIDGE);
        return;
      }

      const info = await api.memory.getInfo();
      this._memoryInfo.value = info;
      this._error.value = info.source === 'native' ? null : info.error || '原生接口不可用';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._error.value = message;
      this._memoryInfo.value = emptyInfo(message);
    } finally {
      this.polling = false;
    }
  }

  // Perform a real memory cleanup
  async cleanup(areas: CleanupArea[]): Promise<CleanupResult> {
    const api = window.electronAPI;
    if (!api?.memory) {
      throw new Error(NO_BRIDGE);
    }

    const result = await api.memory.cleanup(areas);

    // Refresh immediately after cleanup so the UI doesn't wait for the next poll
    await this.update();

    return result;
  }

  // Diagnostics for native interface / administrator privileges
  async getDiagnostics() {
    const api = window.electronAPI;
    if (!api?.memory) {
      return {
        platform: 'unknown',
        arch: 'unknown',
        nativeAvailable: false,
        elevated: false,
        error: NO_BRIDGE,
      };
    }
    return api.memory.getDiagnostics();
  }
}

// Export singleton
export const memoryMonitor = new MemoryMonitor();
