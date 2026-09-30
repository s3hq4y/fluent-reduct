/**
 * Renderer global augmentation.
 *
 * `window.electronAPI` is injected by the preload script. It is typed as
 * possibly undefined so every access site is forced to handle a failed bridge.
 */

import type { ElectronAPI } from '../../shared/types';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
