/**
 * Fluent Reduct - floating cleanup ball (renderer).
 *
 * A small, always-on-top companion window that shows physical memory usage and
 * runs a cleanup on click. It deliberately does NOT own any cleanup logic:
 * requesting a cleanup asks the main process, which routes it to the main
 * window so confirmation, logging and the progress UI all stay in one place.
 *
 * Geometry also belongs to the main process. This module only draws whichever
 * shape it is told to draw - a full ball, or a thin bar along a screen edge -
 * because only the main process knows the work area and can size the window to
 * match.
 */

import { formatBytes } from '../../shared/format';
import { createTranslator, resolveLocale } from '../../shared/i18n/translate';
import type { BallDockState, MemoryInfo } from '../../shared/types';

const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** How far the pointer must move before a press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

/**
 * How long to wait after a click before deciding it was not the first half of a
 * double-click. Kept short so a single click still feels responsive, but long
 * enough to cover the OS double-click interval.
 */
const DOUBLE_CLICK_DELAY_MS = 250;

/** Memory warning/danger thresholds (kept in sync with the main window). */
const WARNING_LEVEL = 70;
const DANGER_LEVEL = 90;

/** How long the freed amount stays on screen after a cleanup. */
const RESULT_DISPLAY_MS = 2500;

const POLL_INTERVAL_MS = 1500;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

class BallWindow {
  private readonly ball = byId('ball');
  private readonly bar = byId('bar');
  private readonly ring = byId<SVGCircleElement>('ball-ring');
  private readonly percent = byId('ball-percent');
  private readonly hint = byId('ball-hint');
  private readonly barFill = byId('bar-fill');

  /** Latest reading, kept so a shape change can repaint without a new sample. */
  private info: MemoryInfo | null = null;

  private cleaning = false;
  private dragging = false;
  /** Pending single-click timer; cancelled if a second click follows. */
  private clickTimer: number | null = null;

  private pointerStart = { x: 0, y: 0 };
  /**
   * Offset from the window centre to the point the user grabbed, so the ball
   * does not jump under the cursor when the drag starts.
   */
  private grabOffset = { x: 0, y: 0 };

  async start(): Promise<void> {
    const api = window.electronAPI;
    if (!api) throw new Error('Preload bridge unavailable');

    // Match the main window's accent color and locale.
    const state = await api.store.load();
    this.applyAccent(state.settings.theme.accentColor);

    const locale =
      state.settings.language === 'system'
        ? resolveLocale(navigator.language)
        : state.settings.language;
    const t = createTranslator(locale);
    document.documentElement.lang = locale;

    // The tooltip names the double-click action, since that is the one that is
    // not discoverable by hovering alone.
    const label = t('btn.clean');
    this.ball.setAttribute('aria-label', label);
    this.bar.setAttribute('aria-label', label);
    this.ball.title = label;
    this.bar.title = label;

    this.bindPointer();
    this.bindHover();
    this.bindDockChanges();
    this.bindCleanupEvents();
    this.bindContextMenu();

    await this.refresh();
    window.setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  // ==================== Appearance ====================

  private applyAccent(accentColor: string): void {
    document.documentElement.style.setProperty('--ball-accent', accentColor);
    document.documentElement.style.setProperty(
      '--ball-accent-hover',
      BallWindow.shade(accentColor, -18)
    );
  }

  /** Darken/lighten a `#rrggbb` color by a percentage. */
  private static shade(hex: string, percent: number): string {
    const value = parseInt(hex.replace('#', ''), 16);
    const clamp = (channel: number): number => Math.min(255, Math.max(0, channel));
    const r = clamp((value >> 16) + percent);
    const g = clamp(((value >> 8) & 0x00ff) + percent);
    const b = clamp((value & 0x0000ff) + percent);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  // ==================== Shape ====================

  /**
   * Switch between the full ball and the collapsed edge bar.
   *
   * The main process has already resized and repositioned the window, so this
   * only toggles which element is displayed and which way the bar fills.
   */
  private applyDock(dock: BallDockState): void {
    const collapsed = dock.collapsed;
    const docked = dock.edge !== null;

    document.body.dataset.shape = collapsed ? 'bar' : 'ball';
    document.body.dataset.docked = String(docked);
    document.body.dataset.edge = dock.edge ?? 'right';

    // Keep only the visible shape in the accessibility tree.
    this.ball.setAttribute('aria-hidden', String(collapsed));
    this.bar.setAttribute('aria-hidden', String(!collapsed));

    this.repaint();
  }

  private bindDockChanges(): void {
    window.electronAPI?.on.ballDockChange((dock) => this.applyDock(dock));
  }

  // ==================== Memory readout ====================

  private async refresh(): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;

    try {
      this.info = await api.memory.getInfo();
      this.repaint();
    } catch {
      // Transient IPC failure: keep the last value rather than flashing an error.
    }
  }

  /** Repaint both shapes from the latest reading. */
  private repaint(): void {
    const info = this.info;
    if (!info) return;

    document.body.dataset.level =
      info.physical.percent >= DANGER_LEVEL
        ? 'danger'
        : info.physical.percent >= WARNING_LEVEL
          ? 'warning'
          : 'normal';

    // Ball: the percentage, plus a ring around the rim.
    this.percent.textContent = `${info.physical.percentFormatted}%`;
    this.ring.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - info.physical.percent / 100)
    );

    // Bar: the same value as a fill level growing from the screen edge. The
    // edge rules in the stylesheet decide whether that maps to width or height.
    this.barFill.style.setProperty('--bar-level', `${info.physical.percent}%`);

    // The tooltip stays on the action label set at startup: it is the only
    // hint that the ball responds to clicks, and the numbers are already on
    // screen. The memory summary would overwrite that hint on every poll.
  }

  // ==================== Cleanup ====================

  private bindCleanupEvents(): void {
    const api = window.electronAPI;
    if (!api) return;

    api.on.cleanupProgress((progress) => {
      this.setCleaning(true);
      this.hint.textContent = `${progress.index + 1}/${progress.total}`;
    });

    // The main window reports when the run settles, including when the user
    // cancels the confirmation, so the ball can never get stuck in a busy state.
    api.on.cleanupFinished((freed) => this.setCleaning(false, freed));
  }

  /**
   * Leave the busy state. When the run reclaimed memory the ball briefly shows
   * the amount, which is the only feedback a ball-initiated run produces - the
   * main window stays hidden throughout.
   */
  private setCleaning(cleaning: boolean, freed = 0): void {
    this.cleaning = cleaning;
    document.body.classList.toggle('is-cleaning', cleaning);
    if (cleaning) return;

    if (freed > 0) {
      this.hint.textContent = formatBytes(freed);
      window.setTimeout(() => {
        if (!this.cleaning) this.hint.textContent = 'RAM';
      }, RESULT_DISPLAY_MS);
    } else {
      this.hint.textContent = 'RAM';
    }

    void this.refresh();
  }

  /**
   * Ask the main process to run a cleanup.
   *
   * The main process runs it in the (hidden) main window and never reveals it,
   * so the ball is the only visible feedback.
   */
  private runCleanup(): void {
    this.hint.textContent = '...';
    this.setCleaning(true);
    window.electronAPI?.ball.requestCleanup();
  }

  // ==================== Interaction ====================

  /**
   * Drag handling is bound to `body` rather than the ball so the collapsed bar
   * is draggable too.
   *
   * Positions are sent as the desired window centre, derived from the pointer's
   * screen position. Using screen coordinates avoids reconciling window origins,
   * which move whenever the main process swaps shapes mid-drag.
   */
  private bindPointer(): void {
    document.body.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      document.body.setPointerCapture(event.pointerId);

      this.pointerStart = { x: event.screenX, y: event.screenY };
      this.grabOffset = {
        x: event.screenX - (window.screenX + window.outerWidth / 2),
        y: event.screenY - (window.screenY + window.outerHeight / 2),
      };
      this.dragging = false;
    });

    document.body.addEventListener('pointermove', (event) => {
      if (!document.body.hasPointerCapture(event.pointerId)) return;

      const dx = event.screenX - this.pointerStart.x;
      const dy = event.screenY - this.pointerStart.y;

      if (!this.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      if (!this.dragging) {
        this.dragging = true;
        document.body.classList.add('is-dragging');
      }

      window.electronAPI?.ball.setPosition(
        event.screenX - this.grabOffset.x,
        event.screenY - this.grabOffset.y
      );
    });

    const endDrag = (event: PointerEvent): void => {
      if (document.body.hasPointerCapture(event.pointerId)) {
        document.body.releasePointerCapture(event.pointerId);
      }
      document.body.classList.remove('is-dragging');

      if (!this.dragging) return;
      this.dragging = false;
      window.electronAPI?.ball.commitPosition();
    };

    document.body.addEventListener('pointerup', (event) => {
      const wasDragging = this.dragging;
      endDrag(event);
      if (!wasDragging) this.handleClick();
    });

    document.body.addEventListener('pointercancel', endDrag);
  }

  /**
   * Distinguish a single click from a double click.
   *
   * The single-click action (reveal the main window) is deferred by one
   * double-click interval, so the first half of a double-click does not flash
   * the window open before the second half starts a cleanup.
   */
  private handleClick(): void {
    if (this.clickTimer !== null) {
      window.clearTimeout(this.clickTimer);
      this.clickTimer = null;
      this.runCleanup();
      return;
    }

    this.clickTimer = window.setTimeout(() => {
      this.clickTimer = null;
      window.electronAPI?.ball.showMainWindow();
    }, DOUBLE_CLICK_DELAY_MS);
  }

  /**
   * Report pointer entry/exit so a docked ball can expand while pointed at and
   * collapse again afterwards. `pointerenter`/`pointerleave` do not bubble but
   * are delivered to ancestors, so binding them to `body` tracks the window.
   */
  private bindHover(): void {
    document.body.addEventListener('pointerenter', () => {
      if (!this.dragging) window.electronAPI?.ball.setHover(true);
    });

    document.body.addEventListener('pointerleave', () => {
      if (!this.dragging) window.electronAPI?.ball.setHover(false);
    });
  }

  /**
   * Right-click opens the main window.
   *
   * Left-click behaviour is handled in `handleClick`, because a double click
   * must be told apart from a single one before either action runs.
   */
  private bindContextMenu(): void {
    document.body.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      window.electronAPI?.ball.showMainWindow();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void new BallWindow().start().catch((error) => {
    console.error('[fluent-reduct] ball initialization failed', error);
  });
});
