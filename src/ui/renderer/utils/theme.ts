/**
 * Fluent Reduct - theme management.
 *
 * Owns light/dark switching and accent color application. The palette itself
 * lives in `src/shared/theme.ts` so it is not duplicated per process.
 */

import { ACCENT_COLORS } from '../../../shared/theme';
import type { ThemeConfig, ThemeMode } from '../../../shared/types';

export { ACCENT_COLORS };

/** Derive every accent-dependent CSS variable from one base color. */
function generateColorVariants(baseColor: string): Record<string, string> {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return {
    '--color-accent': baseColor,
    '--color-accent-light': `rgba(${r}, ${g}, ${b}, 0.1)`,
    '--color-accent-hover': adjustBrightness(baseColor, -15),
    '--color-accent-active': adjustBrightness(baseColor, -30),
    '--color-accent-text': getContrastColor(r, g, b),
  };
}

function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Pick black or white text for a background, using the YIQ luminance formula. */
function getContrastColor(r: number, g: number, b: number): string {
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export class ThemeManager {
  private mode: ThemeMode = 'light';
  private accentColor = ACCENT_COLORS[0].value;
  private readonly prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.prefersDark.addEventListener('change', () => {
      if (this.mode === 'system') this.apply();
    });
  }

  init(config: ThemeConfig): void {
    this.mode = config.mode;
    this.accentColor = config.accentColor;
    this.apply();
  }

  getMode(): ThemeMode {
    return this.mode;
  }

  getAccentColor(): string {
    return this.accentColor;
  }

  setMode(mode: ThemeMode): void {
    this.mode = mode;
    this.apply();
  }

  setAccentColor(color: string): void {
    this.accentColor = color;
    this.apply();
  }

  /** Whether dark mode is currently in effect (resolving `system`). */
  isDark(): boolean {
    return this.mode === 'system' ? this.prefersDark.matches : this.mode === 'dark';
  }

  apply(): void {
    const root = document.documentElement;
    const isDark = this.isDark();

    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    for (const [property, value] of Object.entries(generateColorVariants(this.accentColor))) {
      root.style.setProperty(property, value);
    }

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#1a1a1a' : '#f5f5f5');
  }
}

export const themeManager = new ThemeManager();
