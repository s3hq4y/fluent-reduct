/**
 * Fluent Reduct - Windows memory API wrapper (main process).
 *
 * Calls Win32 / NT native interfaces directly via koffi, with no simulation:
 *   - Readings: GlobalMemoryStatusEx, K32GetPerformanceInfo, NtQuerySystemInformation
 *   - Cleanup:  NtSetSystemInformation (same interface as native Mem Reduct)
 *
 * Cleanup requires administrator privileges (SeProfileSingleProcessPrivilege /
 * SeIncreaseQuotaPrivilege). When not elevated, failures are reported honestly
 * per area; results are never faked.
 *
 * User-facing strings are localized: the caller passes a `Translator`, so this
 * module never hardcodes a language.
 */

import * as os from 'os';
import { CLEANUP_AREA_INFO, CLEANUP_AREA_ORDER } from '../../shared/cleanup';
import type { Translator, TranslationKey } from '../../shared/i18n/translate';
import type {
  AreaResult,
  CleanupArea,
  CleanupProgressEvent,
  CleanupResult,
  MemoryDiagnostics,
  MemoryInfo,
  MemoryRegion,
} from '../../shared/types';

// ==================== Native bindings ====================

const IS_WINDOWS = process.platform === 'win32';
const PTR_SIZE = ['x64', 'arm64'].includes(process.arch) ? 8 : 4;

/**
 * koffi is loaded lazily through `require` so a failed native load degrades the
 * app to fallback readings instead of crashing the main process at startup.
 */
type Koffi = typeof import('koffi');

interface NativeBindings {
  koffi: Koffi;
  globalMemoryStatusEx: (status: unknown) => number;
  getPerformanceInfo: (perf: unknown, size: number) => number;
  ntQuerySystemInformation: (
    cls: number,
    buffer: Buffer,
    length: number,
    returnLength: number[]
  ) => number;
  ntSetSystemInformation: (cls: number, buffer: Buffer | null, length: number) => number;
  rtlAdjustPrivilege: (
    privilege: number,
    enable: number,
    client: number,
    wasEnabled: number[]
  ) => number;
  isUserAnAdmin: () => number;
}

let bindings: NativeBindings | null = null;
let loadError: string | null = null;

function initNative(): void {
  if (bindings || loadError) return;

  if (!IS_WINDOWS) {
    loadError = 'unsupported-platform';
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi') as Koffi;

    const MEMORYSTATUSEX = koffi.struct('MEMORYSTATUSEX', {
      dwLength: 'uint32',
      dwMemoryLoad: 'uint32',
      ullTotalPhys: 'uint64',
      ullAvailPhys: 'uint64',
      ullTotalPageFile: 'uint64',
      ullAvailPageFile: 'uint64',
      ullTotalVirtual: 'uint64',
      ullAvailVirtual: 'uint64',
      ullAvailExtendedVirtual: 'uint64',
    });

    const PERFORMANCE_INFORMATION = koffi.struct('PERFORMANCE_INFORMATION', {
      cb: 'uint32',
      CommitTotal: 'size_t',
      CommitLimit: 'size_t',
      CommitPeak: 'size_t',
      PhysicalTotal: 'size_t',
      PhysicalAvailable: 'size_t',
      SystemCache: 'size_t',
      KernelTotal: 'size_t',
      KernelPaged: 'size_t',
      KernelNonpaged: 'size_t',
      PageSize: 'size_t',
      HandleCount: 'uint32',
      ProcessCount: 'uint32',
      ThreadCount: 'uint32',
    });

    const kernel32 = koffi.load('kernel32.dll');
    const ntdll = koffi.load('ntdll.dll');
    const shell32 = koffi.load('shell32.dll');

    bindings = {
      koffi,
      globalMemoryStatusEx: kernel32.func(
        'int GlobalMemoryStatusEx(_Inout_ MEMORYSTATUSEX *lpBuffer)'
      ),
      getPerformanceInfo: kernel32.func(
        'int K32GetPerformanceInfo(_Out_ PERFORMANCE_INFORMATION *pPerformanceInformation, uint32 cb)'
      ),
      ntQuerySystemInformation: ntdll.func(
        'int32 NtQuerySystemInformation(int32 SystemInformationClass, _Out_ void *SystemInformation, uint32 SystemInformationLength, _Out_ uint32 *ReturnLength)'
      ),
      ntSetSystemInformation: ntdll.func(
        'int32 NtSetSystemInformation(int32 SystemInformationClass, void *SystemInformation, uint32 SystemInformationLength)'
      ),
      rtlAdjustPrivilege: ntdll.func(
        'int32 RtlAdjustPrivilege(uint32 Privilege, uint8 Enable, uint8 Client, _Out_ uint8 *WasEnabled)'
      ),
      isUserAnAdmin: shell32.func('int IsUserAnAdmin()'),
    };

    // Touch the structs so an ABI mismatch surfaces during init rather than mid-cleanup.
    void MEMORYSTATUSEX;
    void PERFORMANCE_INFORMATION;
  } catch (err) {
    bindings = null;
    loadError = err instanceof Error ? err.message : String(err);
  }
}

// ==================== Readings ====================

function makeRegion(total: number, free: number): MemoryRegion {
  const safeTotal = total > 0 ? total : 0;
  const safeFree = Math.max(0, Math.min(free, safeTotal));
  const used = safeTotal - safeFree;
  const percent = safeTotal > 0 ? (used / safeTotal) * 100 : 0;

  return {
    total: safeTotal,
    used,
    free: safeFree,
    percent: Math.round(percent * 10) / 10,
    percentFormatted: Math.round(percent),
  };
}

/** koffi may return 64-bit integers as BigInt; sizes are far below 2^53. */
function num(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function fallbackInfo(message: string): MemoryInfo {
  const empty = makeRegion(0, 0);
  return {
    physical: makeRegion(os.totalmem(), os.freemem()),
    pagefile: empty,
    systemCache: empty,
    source: 'fallback',
    error: message,
  };
}

const SystemMemoryListInformation = 80;

/**
 * Reads the memory lists via NtQuerySystemInformation(SystemMemoryListInformation)
 * and computes the Task-Manager "cached" value = standby list + modified page list.
 *
 * GetPerformanceInfo's SystemCache field has inconsistent semantics on modern
 * Windows, so it is only a fallback.
 *
 * SYSTEM_MEMORY_LIST_INFORMATION (x64) layout:
 *   0   ZeroPageCount
 *   8   FreePageCount
 *   16  ModifiedPageCount
 *   24  ModifiedNoWritePageCount
 *   32  BadPageCount
 *   40  PageCountByPriority[8]        <- standby list, by priority
 *   104 RepurposedPagesByPriority[8]
 *   168 ModifiedPageCountPageFile
 */
function readCachedBytes(pageSize: number): number | null {
  if (!bindings) return null;

  try {
    const buf = Buffer.alloc(512);
    const returnLength: number[] = [0];
    const status = bindings.ntQuerySystemInformation(
      SystemMemoryListInformation,
      buf,
      buf.length,
      returnLength
    );
    if (status < 0) return null;

    const readSize = (offset: number): number =>
      PTR_SIZE === 8 ? Number(buf.readBigUInt64LE(offset)) : buf.readUInt32LE(offset);

    const modifiedOffset = 2 * PTR_SIZE;
    const standbyOffset = 5 * PTR_SIZE;
    const standbyPriorities = 8;

    let standbyPages = 0;
    for (let i = 0; i < standbyPriorities; i++) {
      standbyPages += readSize(standbyOffset + i * PTR_SIZE);
    }
    const modifiedPages = readSize(modifiedOffset);

    return (standbyPages + modifiedPages) * pageSize;
  } catch {
    return null;
  }
}

export function getMemoryInfo(t: Translator): MemoryInfo {
  initNative();

  if (!bindings) {
    const message = loadError === 'unsupported-platform'
      ? t('error.unsupportedPlatform', { platform: process.platform })
      : loadError || t('error.nativeUnavailable');
    return fallbackInfo(message);
  }

  try {
    const status: Record<string, unknown> = { dwLength: 64, dwMemoryLoad: 0 };
    if (!bindings.globalMemoryStatusEx(status)) {
      return fallbackInfo(t('error.globalMemoryStatusEx'));
    }

    const perf: Record<string, unknown> = {};
    const PERFORMANCE_INFORMATION_SIZE = 104;
    const perfOk = bindings.getPerformanceInfo(perf, PERFORMANCE_INFORMATION_SIZE) !== 0;

    const totalPhys = num(status.ullTotalPhys);
    const availPhys = num(status.ullAvailPhys);

    // Commit charge: prefer converting page counts from GetPerformanceInfo, which
    // matches Task Manager; fall back to MEMORYSTATUSEX page file fields.
    let commitTotal: number;
    let commitFree: number;
    let cacheUsed: number;

    if (perfOk) {
      const pageSize = num(perf.PageSize) || 4096;
      const commitLimit = num(perf.CommitLimit) * pageSize;
      const commitUsed = num(perf.CommitTotal) * pageSize;
      commitTotal = commitLimit;
      commitFree = Math.max(0, commitLimit - commitUsed);

      const cached = readCachedBytes(pageSize);
      cacheUsed = cached !== null ? cached : num(perf.SystemCache) * pageSize;
    } else {
      commitTotal = num(status.ullTotalPageFile);
      commitFree = num(status.ullAvailPageFile);
      cacheUsed = readCachedBytes(4096) ?? 0;
    }

    return {
      physical: makeRegion(totalPhys, availPhys),
      pagefile: makeRegion(commitTotal, commitFree),
      // System cache uses total physical memory as its base so the percentage is meaningful
      systemCache: makeRegion(totalPhys, Math.max(0, totalPhys - cacheUsed)),
      source: 'native',
    };
  } catch (err) {
    return fallbackInfo(err instanceof Error ? err.message : String(err));
  }
}

export function isElevated(): boolean {
  initNative();
  if (!bindings) return false;
  try {
    return bindings.isUserAnAdmin() !== 0;
  } catch {
    return false;
  }
}

// ==================== Cleanup ====================

// SYSTEM_INFORMATION_CLASS
const SystemFileCacheInformation = 21;
const SystemFileCacheInformationEx = 81;
const SystemCombinePhysicalMemoryInformation = 130;
const SystemRegistryReconciliationInformation = 155;

// SYSTEM_MEMORY_LIST_COMMAND
const MemoryEmptyWorkingSets = 2;
const MemoryFlushModifiedList = 3;
const MemoryPurgeStandbyList = 4;
const MemoryPurgeLowPriorityStandbyList = 5;

// Privilege indices (RtlAdjustPrivilege uses LUID ordinal numbers)
const SE_INCREASE_QUOTA_PRIVILEGE = 5;
const SE_PROF_SINGLE_PROCESS_PRIVILEGE = 13;

/** NTSTATUS values that carry a dedicated, translated description. */
const NT_STATUS_KEYS: Record<number, TranslationKey> = {
  0xc0000002: 'ntstatus.notImplemented',
  0xc0000003: 'ntstatus.invalidInfoClass',
  0xc0000022: 'ntstatus.accessDenied',
  0xc0000061: 'ntstatus.privilegeNotHeld',
  0xc00000bb: 'ntstatus.notSupported',
  0xc000000d: 'ntstatus.invalidParameter',
};

function statusText(status: number, t: Translator): string {
  const unsigned = status >>> 0;
  const key = NT_STATUS_KEYS[unsigned];
  if (key) return t(key);
  return t('ntstatus.unknown', { code: unsigned.toString(16).padStart(8, '0') });
}

function writeSizeT(buf: Buffer, offset: number, value: bigint): void {
  if (PTR_SIZE === 8) buf.writeBigUInt64LE(value, offset);
  else buf.writeUInt32LE(Number(value & 0xffffffffn), offset);
}

/** SYSTEM_MEMORY_LIST_COMMAND payload. */
function commandBuffer(command: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(command, 0);
  return buf;
}

/**
 * SYSTEM_FILECACHE_INFORMATION: setting Min/MaxWorkingSet to (SIZE_T)-1 requests
 * a flush.
 * x64: 64 bytes, Min at 24, Max at 32; x86: 36 bytes, Min at 12, Max at 16.
 */
function fileCacheBuffer(): Buffer {
  const is64 = PTR_SIZE === 8;
  const buf = Buffer.alloc(is64 ? 64 : 36);
  const allOnes = is64 ? 0xffffffffffffffffn : 0xffffffffn;
  writeSizeT(buf, is64 ? 24 : 12, allOnes);
  writeSizeT(buf, is64 ? 32 : 16, allOnes);
  return buf;
}

/** MEMORY_COMBINE_INFORMATION_EX: all-zero is enough; the kernel fills PagesCombined. */
function combineBuffer(): Buffer {
  return Buffer.alloc(PTR_SIZE === 8 ? 24 : 12);
}

type AreaAction = () => number;

function buildActions(): Record<CleanupArea, AreaAction> {
  if (!bindings) {
    throw new Error('native bindings unavailable');
  }

  const setInfo = (cls: number, buf: Buffer | null): number =>
    bindings!.ntSetSystemInformation(cls, buf, buf ? buf.length : 0);

  return {
    workingset: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryEmptyWorkingSets)),
    systemfilecache: () => setInfo(SystemFileCacheInformation, fileCacheBuffer()),
    modifiedfilecache: () => setInfo(SystemFileCacheInformationEx, fileCacheBuffer()),
    standbypriority0: () =>
      setInfo(SystemMemoryListInformation, commandBuffer(MemoryPurgeLowPriorityStandbyList)),
    standbylist: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryPurgeStandbyList)),
    modifiedlist: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryFlushModifiedList)),
    combinememory: () => setInfo(SystemCombinePhysicalMemoryInformation, combineBuffer()),
    registrycache: () => setInfo(SystemRegistryReconciliationInformation, null),
  };
}

function enablePrivileges(): void {
  if (!bindings) return;
  for (const privilege of [SE_INCREASE_QUOTA_PRIVILEGE, SE_PROF_SINGLE_PROCESS_PRIVILEGE]) {
    try {
      const wasEnabled: number[] = [0];
      bindings.rtlAdjustPrivilege(privilege, 1, 0, wasEnabled);
    } catch {
      // Elevation failure surfaces per area as STATUS_PRIVILEGE_NOT_HELD.
    }
  }
}

/** Sorts areas into the order that reclaims the most memory. */
export function sortAreas(areas: CleanupArea[]): CleanupArea[] {
  const rank = (area: CleanupArea): number => {
    const index = CLEANUP_AREA_ORDER.indexOf(area);
    return index === -1 ? CLEANUP_AREA_ORDER.length : index;
  };
  return [...areas].sort((a, b) => rank(a) - rank(b));
}

/** Localized label of a cleanup area. */
export function areaLabel(area: CleanupArea, t: Translator): string {
  return t(CLEANUP_AREA_INFO[area].labelKey);
}

export type ProgressCallback = (progress: CleanupProgressEvent) => void;

/** The kernel needs a moment to reclaim memory before the "after" sample is taken. */
const RECLAIM_SETTLE_MS = 800;

export async function cleanupMemory(
  requestedAreas: CleanupArea[],
  t: Translator,
  onProgress?: ProgressCallback
): Promise<CleanupResult> {
  const areas = sortAreas(requestedAreas);
  const startTime = Date.now();

  initNative();

  if (!bindings) {
    const message = t('areaResult.nativeUnavailable');
    const info = getMemoryInfo(t);
    return {
      freedMemory: 0,
      duration: 0,
      areas,
      areaResults: areas.map((area) => ({
        area,
        ok: false,
        status: 'unavailable',
        message,
      })),
      elevated: false,
      timestamp: Date.now(),
      before: info,
      after: info,
    };
  }

  const before = getMemoryInfo(t);
  const elevated = isElevated();
  enablePrivileges();

  const actions = buildActions();
  const areaResults: AreaResult[] = [];

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    const label = areaLabel(area, t);
    const action = actions[area];

    if (!action) {
      areaResults.push({ area, ok: false, status: 'unknown', message: t('areaResult.unknown') });
      continue;
    }

    onProgress?.({ area, label, index: i, total: areas.length });

    try {
      const status = action();
      const ok = status >= 0;
      areaResults.push({
        area,
        ok,
        status: `0x${(status >>> 0).toString(16).padStart(8, '0')}`,
        message: ok
          ? t('areaResult.cleaned', { label })
          : `${label}: ${statusText(status, t)}`,
      });
    } catch (err) {
      areaResults.push({
        area,
        ok: false,
        status: 'exception',
        message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Yield the event loop so progress events reach the renderer.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  await new Promise((resolve) => setTimeout(resolve, RECLAIM_SETTLE_MS));

  const after = getMemoryInfo(t);
  const freedMemory = Math.max(0, after.physical.free - before.physical.free);

  return {
    freedMemory,
    duration: (Date.now() - startTime) / 1000,
    areas,
    areaResults,
    elevated,
    timestamp: Date.now(),
    before,
    after,
  };
}

export function getDiagnostics(t: Translator): MemoryDiagnostics {
  initNative();
  const error = !bindings
    ? loadError === 'unsupported-platform'
      ? t('error.unsupportedPlatform', { platform: process.platform })
      : loadError || t('error.nativeUnavailable')
    : null;

  return {
    platform: process.platform,
    arch: process.arch,
    nativeAvailable: !!bindings,
    elevated: isElevated(),
    error,
  };
}
