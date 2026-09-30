/**
 * Fluent Reduct - toast notifications.
 */

import type { ToastOptions } from '../../../shared/types';

const TOAST_ICONS: Record<ToastOptions['type'], string> = {
  success:
    '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
  warning:
    '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
  error:
    '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>',
};

const DEFAULT_DURATION_MS = 5000;

/**
 * Renders transient notifications.
 *
 * Message text is inserted through text nodes rather than innerHTML: cleanup
 * failures embed OS-provided strings that must never be parsed as markup.
 */
export class ToastManager {
  constructor(private readonly container: HTMLElement) {}

  show(options: ToastOptions): void {
    const toast = document.createElement('div');
    toast.className = `toast toast--${options.type}`;

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'toast__icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'currentColor');
    icon.innerHTML = TOAST_ICONS[options.type];

    const content = document.createElement('div');
    content.className = 'toast__content';

    const title = document.createElement('div');
    title.className = 'toast__title';
    title.textContent = options.title;

    const message = document.createElement('div');
    message.className = 'toast__message';
    message.textContent = options.message;

    content.append(title, message);

    const close = document.createElement('button');
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
    close.addEventListener('click', () => toast.remove());

    toast.append(icon, content, close);
    this.container.appendChild(toast);

    window.setTimeout(() => toast.remove(), options.duration ?? DEFAULT_DURATION_MS);
  }
}
