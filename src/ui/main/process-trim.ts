/**
 * Fluent Reduct - per-process working set trimming.
 *
 * A more selective alternative to the system-wide `MemoryEmptyWorkingSets`
 * command. Instead of emptying every working set at once, it walks the process
 * list and trims them individually, which makes it possible to protect the
 * process the user is actually interacting with.
 *
 * Trimming a working set pushes its pages onto the standby list, so this area
 * must run *before* the standby list is purged for the work to pay off.
 *
 * The native surface is injected as `TrimPort`, keeping this module free of FFI
 * details and reasoned about (and testable) on its own.
 */

export interface ProcessEntry {
  pid: number;
  /** Executable name without a path. */
  name: string;
}

/** Native operations this module needs. */
export interface TrimPort {
  /** Every process the OS reports, or null when enumeration fails outright. */
  enumerate(): ProcessEntry[] | null;
  /** Open a handle with the rights required to trim; null when not permitted. */
  open(pid: number): unknown | null;
  /** Trim one process' working set. Returns true on success. */
  emptyWorkingSet(handle: unknown): boolean;
  close(handle: unknown): void;
  /** PID owning the foreground window, or 0 when unknown. */
  foregroundPid(): number;
}

export interface TrimSummary {
  succeeded: number;
  failed: number;
  /** Processes deliberately left alone: protected, in use, or inaccessible. */
  skipped: number;
}

/**
 * Processes that must never be trimmed.
 *
 * These are the kernel, the session infrastructure, and processes whose pages
 * are needed continuously for the machine to stay responsive. Evicting them
 * buys a little memory and costs input latency, audio glitches or worse.
 */
const PROTECTED_NAMES = new Set([
  'system',
  'registry',
  'memory compression',
  'idle',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'dwm.exe',
  'fontdrvhost.exe',
  'audiodg.exe',
]);

const IDLE_PID = 0;
const SYSTEM_PID = 4;

function isProtected(pid: number, name: string, selfPid: number, foregroundPid: number): boolean {
  if (pid === IDLE_PID || pid === SYSTEM_PID) return true;
  // Trimming our own working set would only make this app slower.
  if (pid === selfPid) return true;
  // Evicting whatever the user is looking at causes visible stutter for no
  // lasting gain: the pages are faulted straight back in.
  if (pid === foregroundPid) return true;
  return PROTECTED_NAMES.has(name.toLowerCase());
}

/**
 * Trim every process that is safe to trim.
 *
 * Processes that cannot be opened are counted as skipped rather than failed:
 * many legitimate processes deny access by design, and reporting that as an
 * error would drown out real failures.
 */
export function trimProcessWorkingSets(
  port: TrimPort,
  selfPid: number,
  foregroundPid: number
): TrimSummary {
  const summary: TrimSummary = { succeeded: 0, failed: 0, skipped: 0 };

  const processes = port.enumerate();
  if (!processes) return summary;

  for (const { pid, name } of processes) {
    if (isProtected(pid, name, selfPid, foregroundPid)) {
      summary.skipped++;
      continue;
    }

    const handle = port.open(pid);
    if (!handle) {
      summary.skipped++;
      continue;
    }

    try {
      if (port.emptyWorkingSet(handle)) summary.succeeded++;
      else summary.failed++;
    } finally {
      port.close(handle);
    }
  }

  return summary;
}
