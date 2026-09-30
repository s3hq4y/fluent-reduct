/**
 * Fluent Reduct - cleanup log list.
 */

import { formatBytes } from '../../../shared/format';
import type { Translator } from '../../../shared/i18n/translate';
import type { CleanupLogEntry, CleanupLogStatus } from '../../../shared/types';

const STATUS_LABEL_KEYS: Record<CleanupLogStatus, 'log.status.success' | 'log.status.partial' | 'log.status.failed'> = {
  success: 'log.status.success',
  partial: 'log.status.partial',
  failed: 'log.status.failed',
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour12: false };

export interface LogListElements {
  list: HTMLElement;
  empty: HTMLElement;
}

export class LogList {
  constructor(
    private readonly elements: LogListElements,
    private readonly t: Translator
  ) {}

  render(entries: CleanupLogEntry[]): void {
    this.elements.list.replaceChildren();

    const isEmpty = entries.length === 0;
    this.elements.empty.style.display = isEmpty ? 'block' : 'none';
    if (isEmpty) return;

    for (const entry of entries) {
      this.elements.list.appendChild(this.renderEntry(entry));
    }
  }

  private renderEntry(entry: CleanupLogEntry): HTMLLIElement {
    const t = this.t;

    const item = document.createElement('li');
    item.className = 'log-entry';

    const dot = document.createElement('span');
    dot.className = `log-entry__dot log-entry__dot--${entry.status}`;

    const time = document.createElement('span');
    time.className = 'log-entry__time';
    time.textContent = new Date(entry.time).toLocaleTimeString(undefined, TIME_FORMAT);

    const main = document.createElement('div');
    main.className = 'log-entry__main';

    const statusLabel = t(STATUS_LABEL_KEYS[entry.status]);
    const autoSuffix = entry.auto ? ` · ${t('log.auto')}` : '';
    const line = document.createElement('div');
    line.className = 'log-entry__line';
    line.textContent = t('log.line', {
      status: statusLabel,
      auto: autoSuffix,
      areas: t('log.detail.areas', { count: entry.areasCount }),
      seconds: t('log.detail.seconds', { seconds: entry.durationSec.toFixed(1) }),
    });

    const detail = document.createElement('div');
    detail.className = 'log-entry__detail';
    const parts = [
      t('log.percent', { before: entry.percentBefore, after: entry.percentAfter }),
    ];
    if (entry.failCount > 0) parts.push(t('log.detail.failCount', { count: entry.failCount }));
    if (entry.message) parts.push(entry.message);
    detail.textContent = parts.join(' · ');

    main.append(line, detail);

    const freed = document.createElement('span');
    freed.className = 'log-entry__freed';
    freed.textContent = entry.freed > 0 ? formatBytes(entry.freed) : '—';

    item.append(dot, time, main, freed);
    return item;
  }
}
