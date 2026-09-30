/**
 * Fluent Reduct - cleanup area selector.
 *
 * The checkbox list is generated from the shared area catalog, so adding an
 * area is a single edit in `src/shared/cleanup.ts` instead of touching markup,
 * CSS and three TypeScript files.
 */

import {
  CLEANUP_AREA_GROUPS,
  CLEANUP_AREA_INFO,
  CLEANUP_AREA_ORDER,
  areasInGroup,
} from '../../../shared/cleanup';
import type { Translator } from '../../../shared/i18n/translate';
import type { CleanupArea } from '../../../shared/types';

/** Areas whose checkbox is currently checked, in execution order. */
function readChecked(container: HTMLElement): CleanupArea[] {
  const checked = new Set<CleanupArea>();
  container.querySelectorAll<HTMLInputElement>('input[data-area]').forEach((input) => {
    if (input.checked) checked.add(input.dataset.area as CleanupArea);
  });
  return CLEANUP_AREA_ORDER.filter((area) => checked.has(area));
}

export interface AreaSelectorOptions {
  container: HTMLElement;
  t: Translator;
  onChange: () => void;
}

export class AreaSelector {
  private readonly container: HTMLElement;
  private readonly t: Translator;
  private readonly onChange: () => void;

  constructor(options: AreaSelectorOptions) {
    this.container = options.container;
    this.t = options.t;
    this.onChange = options.onChange;
    this.render();
  }

  /** Rebuild the list. Safe to call again after the language changes. */
  render(): void {
    this.container.replaceChildren();

    for (const group of CLEANUP_AREA_GROUPS) {
      this.container.appendChild(this.renderGroup(group.id));
    }
  }

  /** Apply a full area -> checked map. */
  setAreas(areas: Record<CleanupArea, boolean>): void {
    this.container.querySelectorAll<HTMLInputElement>('input[data-area]').forEach((input) => {
      input.checked = areas[input.dataset.area as CleanupArea] ?? false;
    });
  }

  /** Apply a set of checked areas; anything absent is unchecked. */
  setChecked(areas: Iterable<CleanupArea>): void {
    const selected = new Set(areas);
    this.container.querySelectorAll<HTMLInputElement>('input[data-area]').forEach((input) => {
      input.checked = selected.has(input.dataset.area as CleanupArea);
    });
  }

  /** Currently checked areas, in execution order. */
  getChecked(): CleanupArea[] {
    return readChecked(this.container);
  }

  /** Read the checkboxes as a full area -> checked map. */
  getAreaMap(): Record<CleanupArea, boolean> {
    const checked = new Set(readChecked(this.container));
    const map = {} as Record<CleanupArea, boolean>;
    for (const area of CLEANUP_AREA_ORDER) {
      map[area] = checked.has(area);
    }
    return map;
  }

  /** Toggle read-only presentation (default profile is not user-editable). */
  setReadOnly(readOnly: boolean): void {
    this.container.classList.toggle('is-readonly', readOnly);
  }

  private renderGroup(groupId: (typeof CLEANUP_AREA_GROUPS)[number]['id']): HTMLElement {
    const group = CLEANUP_AREA_GROUPS.find((candidate) => candidate.id === groupId);
    if (!group) throw new Error(`Unknown cleanup group: ${groupId}`);

    const wrapper = document.createElement('div');
    wrapper.className = 'area-group';

    const title = document.createElement('h4');
    title.className = 'area-group__title';
    title.textContent = this.t(group.titleKey);

    if (group.badgeKey) {
      const badge = document.createElement('span');
      badge.className = 'badge badge--warning';
      badge.textContent = this.t(group.badgeKey);
      title.appendChild(badge);
    }

    wrapper.appendChild(title);

    for (const area of areasInGroup(group.id)) {
      wrapper.appendChild(this.renderArea(area));
    }

    return wrapper;
  }

  private renderArea(area: CleanupArea): HTMLLabelElement {
    const info = CLEANUP_AREA_INFO[area];

    const label = document.createElement('label');
    label.className = 'area-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'area-checkbox';
    input.dataset.area = area;
    input.addEventListener('change', () => this.onChange());

    const mark = document.createElement('span');
    mark.className = 'area-checkmark';

    const text = document.createElement('span');
    text.textContent = this.t(info.labelKey);

    if (info.badgeKey) {
      const badge = document.createElement('span');
      badge.className = 'badge badge--info';
      badge.textContent = this.t(info.badgeKey);
      text.appendChild(document.createTextNode(' '));
      text.appendChild(badge);
    }

    label.append(input, mark, text);
    return label;
  }
}
