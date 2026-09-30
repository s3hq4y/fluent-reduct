/**
 * Fluent Reduct - cleanup area catalog.
 *
 * Single source of truth for which areas exist, how they are grouped in the UI,
 * which translation key labels them, and in what order they must run.
 */

import type { TranslationKey } from './i18n/translate';
import type { CleanupArea } from './types';

export type CleanupAreaGroupId = 'basic' | 'advanced' | 'extended';

export interface CleanupAreaInfo {
  /** Translation key for the area label. */
  labelKey: TranslationKey;
  group: CleanupAreaGroupId;
  /** Optional per-area badge (e.g. a minimum Windows version). */
  badgeKey?: TranslationKey;
}

export interface CleanupAreaGroup {
  id: CleanupAreaGroupId;
  titleKey: TranslationKey;
  badgeKey?: TranslationKey;
}

/**
 * Execution order matters: emptying working sets and flushing modified pages
 * push pages onto the standby list, so the standby list must be purged last to
 * reclaim those pushed pages too.
 */
export const CLEANUP_AREA_ORDER: readonly CleanupArea[] = [
  'workingset',
  'processworkingsets',
  'systemfilecache',
  'modifiedfilecache',
  'modifiedlist',
  'standbypriority0',
  'standbylist',
  'combinememory',
  'registrycache',
];

export const CLEANUP_AREA_INFO: Record<CleanupArea, CleanupAreaInfo> = {
  workingset: { labelKey: 'area.workingset', group: 'basic' },
  processworkingsets: { labelKey: 'area.processworkingsets', group: 'advanced' },
  systemfilecache: { labelKey: 'area.systemfilecache', group: 'basic' },
  standbypriority0: { labelKey: 'area.standbypriority0', group: 'basic' },
  modifiedlist: { labelKey: 'area.modifiedlist', group: 'advanced', badgeKey: 'badge.freeze' },
  standbylist: { labelKey: 'area.standbylist', group: 'advanced', badgeKey: 'badge.freeze' },
  modifiedfilecache: { labelKey: 'area.modifiedfilecache', group: 'advanced' },
  registrycache: { labelKey: 'area.registrycache', group: 'extended' },
  combinememory: { labelKey: 'area.combinememory', group: 'extended', badgeKey: 'badge.win10' },
};

/** Display order of the area groups in Settings. */
export const CLEANUP_AREA_GROUPS: readonly CleanupAreaGroup[] = [
  { id: 'basic', titleKey: 'areaGroup.basic' },
  { id: 'advanced', titleKey: 'areaGroup.advanced' },
  { id: 'extended', titleKey: 'areaGroup.extended', badgeKey: 'badge.win81' },
];

/**
 * Areas that only run during auto cleanup when `settings.allowStandbyList` is
 * enabled: purging the standby list can stall the system briefly.
 */
export const STANDBY_PURGE_AREAS: readonly CleanupArea[] = ['standbylist'];

/** Areas cleaned by the built-in default profile. */
export const DEFAULT_CLEANUP_AREAS: Record<CleanupArea, boolean> = {
  workingset: true,
  processworkingsets: false,
  systemfilecache: true,
  standbypriority0: true,
  modifiedlist: false,
  standbylist: false,
  modifiedfilecache: true,
  registrycache: true,
  combinememory: true,
};

/** Areas of the default profile, in execution order. */
export const DEFAULT_CLEANUP_AREAS_LIST: readonly CleanupArea[] =
  CLEANUP_AREA_ORDER.filter((area) => DEFAULT_CLEANUP_AREAS[area]);

/** Areas of a group, in execution order. */
export function areasInGroup(group: CleanupAreaGroupId): CleanupArea[] {
  return CLEANUP_AREA_ORDER.filter((area) => CLEANUP_AREA_INFO[area].group === group);
}
