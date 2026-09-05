/**
 * Fluent Reduct - Windows memory API wrapper (main process)
 *
 * Calls Win32 / NT native interfaces directly via koffi, with no simulation:
 *   - Readings: GlobalMemoryStatusEx, K32GetPerformanceInfo
 *   - Cleanup: NtSetSystemInformation (same interface as native Mem Reduct)
 *
 * Cleanup requires administrator privileges (SeProfileSingleProcessPrivilege /
 * SeIncreaseQuotaPrivilege). When not elevated, failures are reported honestly
 * per area; results are never faked.
 */

import * as os from 'os';

export interface MemoryRegion {
  total: number;
  used: number;
  free: number;
  percent: number;
  percentFormatted: number;
}

export interface MemoryInfo {
  physical: MemoryRegion;
  pagefile: MemoryRegion;
  systemCache: MemoryRegion;
  source: 'native' | 'fallback';
  error?: string;
}

export type CleanupArea =
  | 'workingset'
  | 'systemfilecache'
  | 'standbypriority0'
  | 'modifiedlist'
  | 'standbylist'
  | 'modifiedfilecache'
  | 'registrycache'
  | 'combinememory';

export interface AreaResult {
  area: CleanupArea;
  ok: boolean;
  status: string;
  message: string;
}

export interface CleanupResult {
  /** Physical memory actually freed, in bytes (free-after vs free-before, never negative) */
  freedMemory: number;
  duration: number;
  areas: CleanupArea[];
  areaResults: AreaResult[];
  elevated: boolean;
  timestamp: number;
  before: MemoryInfo;
  after: MemoryInfo;
}

// ==================== koffi bindings ====================

const isWindows = process.platform === 'win32';
const PTR_SIZE = ['x64', 'arm64'].includes(process.arch) ? 8 : 4;

let koffi: any = null;
let loadError: string | null = null;

let GlobalMemoryStatusEx: any = null;
let GetPerformanceInfo: any = null;
let NtQuerySystemInformation: any = null;
let NtSetSystemInformation: any = null;
let RtlAdjustPrivilege: any = null;
let IsUserAnAdmin: any = null;

function initNative(): void {
  if (koffi || loadError) return;
  if (!isWindows) {
    loadError = `不支持的平台: ${process.platform}（本模块仅支持 Windows）`;
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    koffi = require('koffi');

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

    GlobalMemoryStatusEx = kernel32.func('int GlobalMemoryStatusEx(_Inout_ MEMORYSTATUSEX *lpBuffer)');
    GetPerformanceInfo = kernel32.func(
      'int K32GetPerformanceInfo(_Out_ PERFORMANCE_INFORMATION *pPerformanceInformation, uint32 cb)'
    );
    NtQuerySystemInformation = ntdll.func(
      'int32 NtQuerySystemInformation(int32 SystemInformationClass, _Out_ void *SystemInformation, uint32 SystemInformationLength, _Out_ uint32 *ReturnLength)'
    );
    NtSetSystemInformation = ntdll.func(
      'int32 NtSetSystemInformation(int32 SystemInformationClass, void *SystemInformation, uint32 SystemInformationLength)'
    );
    RtlAdjustPrivilege = ntdll.func(
      'int32 RtlAdjustPrivilege(uint32 Privilege, uint8 Enable, uint8 Client, _Out_ uint8 *WasEnabled)'
    );
    IsUserAnAdmin = shell32.func('int IsUserAnAdmin()');
  } catch (err) {
    koffi = null;
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

/** koffi may return 64-bit integers as BigInt; convert to Number (sizes are far below 2^53) */
function num(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function fallbackInfo(error: string): MemoryInfo {
  const total = os.totalmem();
  const free = os.freemem();
  const empty = makeRegion(0, 0);
  return {
    physical: makeRegion(total, free),
    pagefile: empty,
    systemCache: empty,
    source: 'fallback',
    error,
  };
}

/**
 * Reads memory lists via NtQuerySystemInformation(SystemMemoryListInformation)
 * and computes the Task-Manager cached value = standby list + modified page list.
 *
 * GetPerformanceInfo's SystemCache field has inconsistent semantics on modern
 * Windows (in practice about 1GB less than Task Manager), so it is only a
 * fallback.
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
  if (!NtQuerySystemInformation) return null;

  try {
    const buf = Buffer.alloc(512);
    const returnLength: any = [0];
    const status = NtQuerySystemInformation(SystemMemoryListInformation, buf, buf.length, returnLength);
    if (status < 0) return null;

    const readSize = (offset: number): number =>
      PTR_SIZE === 8 ? Number(buf.readBigUInt64LE(offset)) : buf.readUInt32LE(offset);

    const modifiedOffset = 2 * PTR_SIZE;
    const standbyOffset = 5 * PTR_SIZE;

    let standbyPages = 0;
    for (let i = 0; i < 8; i++) {
      standbyPages += readSize(standbyOffset + i * PTR_SIZE);
    }
    const modifiedPages = readSize(modifiedOffset);

    return (standbyPages + modifiedPages) * pageSize;
  } catch {
    return null;
  }
}

export function getMemoryInfo(): MemoryInfo {
  initNative();

  if (!koffi) {
    return fallbackInfo(loadError || '原生接口不可用');
  }

  try {
    const status: any = { dwLength: 64, dwMemoryLoad: 0 };
    if (!GlobalMemoryStatusEx(status)) {
      return fallbackInfo('GlobalMemoryStatusEx 调用失败');
    }

    const perf: any = {};
    const perfOk = GetPerformanceInfo(perf, 104) !== 0;

    const totalPhys = num(status.ullTotalPhys);
    const availPhys = num(status.ullAvailPhys);

    // Commit charge: prefer converting page counts from GetPerformanceInfo,
    // which matches Task Manager's committed figure; fall back to MEMORYSTATUSEX
    // page file fields if that fails.
    let commitTotal: number;
    let commitFree: number;
    let cacheUsed = 0;

    if (perfOk) {
      const pageSize = num(perf.PageSize) || 4096;
      const commitLimit = num(perf.CommitLimit) * pageSize;
      const commitUsed = num(perf.CommitTotal) * pageSize;
      commitTotal = commitLimit;
      commitFree = Math.max(0, commitLimit - commitUsed);

      // Prefer computing cached bytes from the memory lists (matches Task Manager);
      // fall back to SystemCache only if that fails.
      const cached = readCachedBytes(pageSize);
      cacheUsed = cached !== null ? cached : num(perf.SystemCache) * pageSize;
    } else {
      commitTotal = num(status.ullTotalPageFile);
      commitFree = num(status.ullAvailPageFile);
      cacheUsed = readCachedBytes(4096) ?? 0;
    }

    return {
      physical: makeRegion(totalPhys, availPhys),
      // System cache uses total physical memory as its base so the percentage is meaningful
      pagefile: makeRegion(commitTotal, commitFree),
      systemCache: makeRegion(totalPhys, Math.max(0, totalPhys - cacheUsed)),
      source: 'native',
    };
  } catch (err) {
    return fallbackInfo(err instanceof Error ? err.message : String(err));
  }
}

export function isElevated(): boolean {
  initNative();
  if (!koffi || !IsUserAnAdmin) return false;
  try {
    return IsUserAnAdmin() !== 0;
  } catch {
    return false;
  }
}

// ==================== Cleanup ====================

// SYSTEM_INFORMATION_CLASS
const SystemFileCacheInformation = 21;
const SystemMemoryListInformation = 80;
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

const NT_STATUS_TEXT: Record<number, string> = {
  0x00000000: '成功',
  0xc0000002: '系统不支持该操作 (STATUS_NOT_IMPLEMENTED)',
  0xc0000003: '无效的信息类 (STATUS_INVALID_INFO_CLASS)',
  0xc0000022: '访问被拒绝 (STATUS_ACCESS_DENIED)，需要管理员权限',
  0xc0000061: '缺少所需特权 (STATUS_PRIVILEGE_NOT_HELD)，需要管理员权限',
  0xc00000bb: '系统不支持该操作 (STATUS_NOT_SUPPORTED)',
  0xc000000d: '参数无效 (STATUS_INVALID_PARAMETER)',
};

function statusText(status: number): string {
  const unsigned = status >>> 0;
  return NT_STATUS_TEXT[unsigned] || `NTSTATUS 0x${unsigned.toString(16).padStart(8, '0')}`;
}

function writeSizeT(buf: Buffer, offset: number, value: bigint): void {
  if (PTR_SIZE === 8) buf.writeBigUInt64LE(value, offset);
  else buf.writeUInt32LE(Number(value & 0xffffffffn), offset);
}

/** SYSTEM_MEMORY_LIST_COMMAND payload */
function commandBuffer(command: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(command, 0);
  return buf;
}

/**
 * SYSTEM_FILECACHE_INFORMATION: setting Min/MaxWorkingSet to (SIZE_T)-1
 * requests a flush.
 * x64: 64 bytes, Min at 24, Max at 32; x86: 36 bytes, Min at 12, Max at 16.
 */
function fileCacheBuffer(): Buffer {
  const size = PTR_SIZE === 8 ? 64 : 36;
  const minOff = PTR_SIZE === 8 ? 24 : 12;
  const maxOff = PTR_SIZE === 8 ? 32 : 16;
  const buf = Buffer.alloc(size);
  const allOnes = PTR_SIZE === 8 ? 0xffffffffffffffffn : 0xffffffffn;
  writeSizeT(buf, minOff, allOnes);
  writeSizeT(buf, maxOff, allOnes);
  return buf;
}

/** MEMORY_COMBINE_INFORMATION_EX: all-zero is enough; the kernel fills PagesCombined */
function combineBuffer(): Buffer {
  return Buffer.alloc(PTR_SIZE === 8 ? 24 : 12);
}

interface AreaAction {
  label: string;
  run: () => number;
}

function buildActions(): Record<CleanupArea, AreaAction> {
  const setInfo = (cls: number, buf: Buffer | null): number =>
    NtSetSystemInformation(cls, buf, buf ? buf.length : 0);

  return {
    workingset: {
      label: '进程工作集',
      run: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryEmptyWorkingSets)),
    },
    systemfilecache: {
      label: '系统文件缓存',
      run: () => setInfo(SystemFileCacheInformation, fileCacheBuffer()),
    },
    modifiedfilecache: {
      label: '修改文件缓存',
      run: () => setInfo(SystemFileCacheInformationEx, fileCacheBuffer()),
    },
    standbypriority0: {
      label: '低优先级待机列表',
      run: () =>
        setInfo(SystemMemoryListInformation, commandBuffer(MemoryPurgeLowPriorityStandbyList)),
    },
    standbylist: {
      label: '待机列表',
      run: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryPurgeStandbyList)),
    },
    modifiedlist: {
      label: '修改页面列表',
      run: () => setInfo(SystemMemoryListInformation, commandBuffer(MemoryFlushModifiedList)),
    },
    combinememory: {
      label: '合并内存列表',
      run: () => setInfo(SystemCombinePhysicalMemoryInformation, combineBuffer()),
    },
    registrycache: {
      label: '注册表缓存',
      run: () => setInfo(SystemRegistryReconciliationInformation, null),
    },
  };
}

function enablePrivileges(): void {
  if (!RtlAdjustPrivilege) return;
  for (const privilege of [SE_INCREASE_QUOTA_PRIVILEGE, SE_PROF_SINGLE_PROCESS_PRIVILEGE]) {
    try {
      const wasEnabled: any = [0];
      RtlAdjustPrivilege(privilege, 1, 0, wasEnabled);
    } catch {
      /* If elevation fails, later calls return STATUS_PRIVILEGE_NOT_HELD; each area reports it honestly */
    }
  }
}

export type ProgressCallback = (progress: {
  area: CleanupArea;
  label: string;
  index: number;
  total: number;
}) => void;

/**
 * Cleanup order significantly affects reclaimed memory: emptying the working
 * set / flushing modified pages pushes pages into the standby list, so the
 * standby list must be cleaned last to also reclaim those pushed pages.
 */
const AREA_ORDER: CleanupArea[] = [
  'workingset',
  'systemfilecache',
  'modifiedfilecache',
  'modifiedlist',
  'standbypriority0',
  'standbylist',
  'combinememory',
  'registrycache',
];

function sortAreas(areas: CleanupArea[]): CleanupArea[] {
  const rank = (a: CleanupArea) => {
    const i = AREA_ORDER.indexOf(a);
    return i === -1 ? AREA_ORDER.length : i;
  };
  return [...areas].sort((a, b) => rank(a) - rank(b));
}

export async function cleanupMemory(
  requestedAreas: CleanupArea[],
  onProgress?: ProgressCallback
): Promise<CleanupResult> {
  const areas = sortAreas(requestedAreas);
  const startTime = Date.now();
  const before = getMemoryInfo();

  initNative();

  if (!koffi) {
    const message = loadError || '原生接口不可用';
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
      before,
      after: before,
    };
  }

  const elevated = isElevated();
  enablePrivileges();

  const actions = buildActions();
  const areaResults: AreaResult[] = [];

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    const action = actions[area];

    if (!action) {
      areaResults.push({ area, ok: false, status: 'unknown', message: '未知的清理区域' });
      continue;
    }

    onProgress?.({ area, label: action.label, index: i, total: areas.length });

    try {
      const status = action.run();
      const ok = status >= 0;
      areaResults.push({
        area,
        ok,
        status: `0x${(status >>> 0).toString(16).padStart(8, '0')}`,
        message: ok ? `${action.label}：已清理` : `${action.label}：${statusText(status)}`,
      });
    } catch (err) {
      areaResults.push({
        area,
        ok: false,
        status: 'exception',
        message: `${action.label}：${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Yield the event loop so progress events can be delivered to the renderer
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // The kernel needs a moment to reclaim memory; wait before sampling so the
  // freed amount is not undercounted
  await new Promise((resolve) => setTimeout(resolve, 800));

  const after = getMemoryInfo();
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

/** Diagnostic info for the settings page / logging */
export function getDiagnostics(): {
  platform: string;
  arch: string;
  nativeAvailable: boolean;
  elevated: boolean;
  error: string | null;
} {
  initNative();
  return {
    platform: process.platform,
    arch: process.arch,
    nativeAvailable: !!koffi,
    elevated: isElevated(),
    error: loadError,
  };
}
