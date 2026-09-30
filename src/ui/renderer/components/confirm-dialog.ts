/**
 * Fluent Reduct - confirmation dialog.
 *
 * Replaces `window.confirm`, which renders an unstyled OS dialog that ignores
 * the application theme and cannot be translated through our catalogs.
 */

/** Question-mark glyph shown next to the message. */
const ICON_PATH =
  '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>';

export interface ConfirmOptions {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export class ConfirmDialog {
  private overlay: HTMLElement | null = null;
  private resolve: ((confirmed: boolean) => void) | null = null;
  private restoreFocusTo: HTMLElement | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.settle(false);
  };

  /**
   * Show the dialog. Resolves `true` when confirmed, `false` when dismissed.
   * Calling it again while a dialog is open dismisses the previous one.
   */
  ask(options: ConfirmOptions): Promise<boolean> {
    this.settle(false);

    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.restoreFocusTo = document.activeElement as HTMLElement | null;
      this.overlay = this.build(options);

      document.body.appendChild(this.overlay);
      document.addEventListener('keydown', this.onKeyDown);
      this.overlay.querySelector<HTMLButtonElement>('[data-role="confirm"]')?.focus();
    });
  }

  private build(options: ConfirmOptions): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.addEventListener('click', (event) => {
      // Only a click on the backdrop itself dismisses the dialog.
      if (event.target === overlay) this.settle(false);
    });

    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';

    const icon = document.createElement('div');
    icon.className = 'confirm-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${ICON_PATH}</svg>`;

    const message = document.createElement('p');
    message.className = 'confirm-message';
    message.textContent = options.message;

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--secondary';
    cancel.textContent = options.cancelLabel;
    cancel.addEventListener('click', () => this.settle(false));

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--primary';
    confirm.dataset.role = 'confirm';
    confirm.textContent = options.confirmLabel;
    confirm.addEventListener('click', () => this.settle(true));

    actions.append(cancel, confirm);
    modal.append(icon, message, actions);
    overlay.appendChild(modal);
    return overlay;
  }

  /** Close the dialog and resolve the pending promise exactly once. */
  private settle(confirmed: boolean): void {
    const resolve = this.resolve;
    if (!resolve) return;
    this.resolve = null;

    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay?.remove();
    this.overlay = null;

    this.restoreFocusTo?.focus();
    this.restoreFocusTo = null;

    resolve(confirmed);
  }
}
