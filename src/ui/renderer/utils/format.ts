/**
 * Fluent Reduct - display formatting helpers.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Largest unit index whose value keeps the number readable. */
function unitIndex(bytes: number): number {
  if (bytes <= 0) return 0;
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.min(BYTE_UNITS.length - 1, Math.max(0, exponent));
}

/** Format a byte count, e.g. `1.23 GB`. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const index = unitIndex(bytes);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(2)} ${BYTE_UNITS[index]}`;
}

/**
 * Format a free/total pair in one shared unit, e.g. `12.3/15.9 GB`.
 * Both values always use the unit chosen for `total`, so the pair reads as one.
 */
export function formatFreeTotal(free: number, total: number): string {
  if (!total || total <= 0) return '0/0 GB';
  const index = unitIndex(total);
  const scale = 1024 ** index;
  return `${(free / scale).toFixed(1)}/${(total / scale).toFixed(1)} ${BYTE_UNITS[index]}`;
}
