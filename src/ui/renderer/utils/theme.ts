/**
 * Fluent Reduct - Theme management
 * Handles light/dark theme switching and custom accent colors
 */

import type { ThemeMode, ThemeConfig, AccentColor } from '../types';

// Preset accent colors
export const ACCENT_COLORS: AccentColor[] = [
  { name: '默认蓝', value: '#0078d4' },
  { name: '靛蓝', value: '#3f51b5' },
  { name: '深蓝', value: '#1565c0' },
  { name: '青色', value: '#00897b' },
  { name: '绿色', value: '#43a047' },
  { name: '橙色', value: '#ef6c00' },
  { name: '红色', value: '#e53935' },
  { name: '粉色', value: '#d81b60' },
  { name: '紫色', value: '#8e24aa' },
  { name: '灰色', value: '#546e7a' },
];

// Generate color variants
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

// Adjust color brightness
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// Get contrast color (black or white)
function getContrastColor(r: number, g: number, b: number): string {
  // Use the YIQ formula to compute luminance
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

// Theme manager class
export class ThemeManager {
  private currentMode: ThemeMode = 'light';
  private currentAccent: string = '#0078d4';
  private prefersDark: MediaQueryList;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    this.prefersDark.addEventListener('change', this.handleSystemThemeChange.bind(this));
  }

  // Initialize theme
  init(config: ThemeConfig): void {
    this.currentMode = config.mode;
    this.currentAccent = config.accentColor;
    this.apply();
  }

  // Get current theme mode
  getMode(): ThemeMode {
    return this.currentMode;
  }

  // Set theme mode
  setMode(mode: ThemeMode): void {
    this.currentMode = mode;
    this.apply();
    this.notifyListeners();
  }

  // Get current accent color
  getAccentColor(): string {
    return this.currentAccent;
  }

  // Set accent color
  setAccentColor(color: string): void {
    this.currentAccent = color;
    this.apply();
    this.notifyListeners();
  }

  // Whether dark mode is currently active
  isDark(): boolean {
    if (this.currentMode === 'system') {
      return this.prefersDark.matches;
    }
    return this.currentMode === 'dark';
  }

  // Apply theme
  apply(): void {
    const root = document.documentElement;
    const isDark = this.isDark();

    // Set theme mode
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Apply accent color
    const colorVariants = generateColorVariants(this.currentAccent);
    Object.entries(colorVariants).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Update meta theme color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#1a1a1a' : '#f5f5f5');
    }
  }

  // Subscribe to theme changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Get config
  getConfig(): ThemeConfig {
    return {
      mode: this.currentMode,
      accentColor: this.currentAccent,
      customColors: [],
    };
  }

  // Handle system theme changes
  private handleSystemThemeChange(): void {
    if (this.currentMode === 'system') {
      this.apply();
      this.notifyListeners();
    }
  }

  // Notify listeners
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

// Export singleton
export const themeManager = new ThemeManager();
