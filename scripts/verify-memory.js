/**
 * 严谨校验：
 *  1) 用「读我们的值 -> 读系统的值 -> 再读我们的值」夹逼，消除采样时间差
 *  2) 拆解 Task Manager「已缓存」= 待机列表 + 修改页列表，确认系统缓存口径
 */
const { execFileSync } = require('child_process');
const { getMemoryInfo } = require('../dist/main/memory.js');

const gb = (n) => (n / 1024 ** 3).toFixed(3) + ' GB';
const mb = (n) => (n / 1024 ** 2).toFixed(1) + ' MB';

const PS = [
  '-NoProfile', '-NonInteractive', '-Command',
  "$m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory; " +
  "[pscustomobject]@{ AvailableBytes=$m.AvailableBytes; CommittedBytes=$m.CommittedBytes; " +
  "CommitLimit=$m.CommitLimit; CacheBytes=$m.CacheBytes; " +
  "SystemCacheResidentBytes=$m.SystemCacheResidentBytes; " +
  "StandbyCacheCoreBytes=$m.StandbyCacheCoreBytes; " +
  "StandbyCacheNormalPriorityBytes=$m.StandbyCacheNormalPriorityBytes; " +
  "StandbyCacheReserveBytes=$m.StandbyCacheReserveBytes; " +
  "ModifiedPageListBytes=$m.ModifiedPageListBytes; " +
  "FreeAndZeroPageListBytes=$m.FreeAndZeroPageListBytes " +
  "} | ConvertTo-Json -Compress"
];

const a = getMemoryInfo();
const win = JSON.parse(execFileSync('powershell.exe', PS, { encoding: 'utf8' }));
const b = getMemoryInfo();

const n = (v) => Number(v);
const standby =
  n(win.StandbyCacheCoreBytes) +
  n(win.StandbyCacheNormalPriorityBytes) +
  n(win.StandbyCacheReserveBytes);
const cachedTaskMgr = standby + n(win.ModifiedPageListBytes);

// 我们两次采样构成的区间，系统值落在区间内即视为一致
function bracket(label, oursA, oursB, theirs) {
  const lo = Math.min(oursA, oursB);
  const hi = Math.max(oursA, oursB);
  const inside = theirs >= lo && theirs <= hi;
  const nearest = theirs < lo ? lo : hi;
  const drift = inside ? 0 : Math.abs(theirs - nearest);
  const rel = theirs === 0 ? 0 : (drift / theirs) * 100;
  console.log(
    `${label.padEnd(16)} 我们=[${gb(lo)} .. ${gb(hi)}]  系统=${gb(theirs).padStart(11)}  ` +
    `${inside ? '✔ 落在区间内' : '偏离 ' + mb(drift) + ' (' + rel.toFixed(3) + '%)'}`
  );
}

console.log('=== 口径比对 ===');
bracket('物理可用', a.physical.free, b.physical.free, n(win.AvailableBytes));
bracket('提交已用', a.pagefile.used, b.pagefile.used, n(win.CommittedBytes));
bracket('提交上限', a.pagefile.total, b.pagefile.total, n(win.CommitLimit));

console.log('\n=== 系统缓存口径分析 ===');
console.log('我们 (GetPerformanceInfo.SystemCache)  :', gb(a.systemCache.used));
console.log('Perf CacheBytes (系统工作集常驻)      :', gb(n(win.CacheBytes)));
console.log('待机列表合计                          :', gb(standby));
console.log('修改页列表                            :', gb(n(win.ModifiedPageListBytes)));
console.log('任务管理器「已缓存」= 待机 + 修改页    :', gb(cachedTaskMgr));
bracket('  对比已缓存', a.systemCache.used, b.systemCache.used, cachedTaskMgr);

console.log('\n=== 任务管理器口径的物理内存 ===');
console.log('总计    :', gb(a.physical.total));
console.log('已使用  :', gb(a.physical.used), '(' + a.physical.percent + '%)');
console.log('可用    :', gb(a.physical.free));
console.log('空闲    :', gb(n(win.FreeAndZeroPageListBytes)));
