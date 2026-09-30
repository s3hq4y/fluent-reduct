/**
 * Fluent Reduct - renderer-side memory monitor.
 *
 * Polls the main process (which owns the native Windows interfaces). When real
 * data is unavailable the state stays empty and carries the error; numbers are
 * never fabricated here.
 */

import type { Translator } from '../../../shared/i18n/translate';
import type {
  CleanupArea,
  CleanupResult,
  MemoryDiagnostics,
  MemoryInfo,
  MemoryRegion,
} from '../../../shared/types';
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

const UNKNOWN_DIAGNOSTICS: MemoryDiagnostics = {
  platform: 'unknown',
  arch: 'unknown',
  nativeAvailable: false,
  elevated: false,
  error: null,
};

export class MemoryMonitor {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private intervalMs = 1000;
  private polling = false;

  private readonly info = createState<MemoryInfo>(emptyInfo());
  private readonly running = createState(false);
  private readonly lastError = createState<string | null>(null);

  constructor(private readonly t: Translator) {}

  get memoryInfo(): State<MemoryInfo> {
    return this.info;
  }

  get isRunning(): State<boolean> {
    return this.running;
  }

  get error(): State<string | null> {
    return this.lastError;
  }

  start(intervalMs = 1000): void {
    if (this.running.value) return;
    this.intervalMs = intervalMs;
    this.running.value = true;
    void this.tick();
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.running.value = false;
  }

  /** Perform a real memory cleanup through the main process. */
  async cleanup(areas: CleanupArea[]): Promise<CleanupResult> {
    const api = window.electronAPI;
    if (!api?.memory) {
      throw new Error(this.t('error.noBridge'));
    }

    const result = await api.memory.cleanup(areas);
    // Refresh immediately so the UI does not wait for the next poll.
    await this.update();
    return result;
  }

  async getDiagnostics(): Promise<MemoryDiagnostics> {
    const api = window.electronAPI;
    if (!api?.memory) {
      return { ...UNKNOWN_DIAGNOSTICS, error: this.t('error.noBridge') };
    }
    return api.memory.getDiagnostics();
  }

  /**
   * Each tick schedules the next one only after the previous read completes, so
   * slow IPC cannot pile up requests.
   */
  private async tick(): Promise<void> {
    if (!this.running.value) return;
    await this.update();
    if (!this.running.value) return;
    this.timerId = setTimeout(() => void this.tick(), this.intervalMs);
  }

  private async update(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const api = window.electronAPI;
      if (!api?.memory) {
        const message = this.t('error.noBridge');
        this.lastError.value = message;
        this.info.value = emptyInfo(message);
        return;
      }

      const info = await api.memory.getInfo();
      this.info.value = info;
      this.lastError.value = info.source === 'native' ? null : info.error ?? this.t('error.nativeUnavailable');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastError.value = message;
      this.info.value = emptyInfo(message);
    } finally {
      this.polling = false;
    }
  }
}
