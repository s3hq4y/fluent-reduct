/**
 * Cross-check our readings against the Windows performance counters.
 *
 * Strategy: read our value, read the system value, read our value again, then
 * check the system value falls inside the interval we observed. That removes
 * sampling skew from the comparison.
 *
 * Also decomposes Task Manager's "cached" figure (standby + modified page list)
 * to confirm the system cache basis.
 */

const { execFileSync } = require('child_process');
const { createTranslator } = require('../dist/main/i18n/translate.js');
const { getMemoryInfo } = require('../dist/main/memory.js');

const t = createTranslator(process.env.FLUENT_REDUCT_LOCALE || 'zh-CN');

const gb = (n) => `${(n / 1024 ** 3).toFixed(3)} GB`;
const mb = (n) => `${(n / 1024 ** 2).toFixed(1)} MB`;

const PS_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  '$m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory; ' +
    '[pscustomobject]@{ AvailableBytes=$m.AvailableBytes; CommittedBytes=$m.CommittedBytes; ' +
    'CommitLimit=$m.CommitLimit; CacheBytes=$m.CacheBytes; ' +
    'StandbyCacheCoreBytes=$m.StandbyCacheCoreBytes; ' +
    'StandbyCacheNormalPriorityBytes=$m.StandbyCacheNormalPriorityBytes; ' +
    'StandbyCacheReserveBytes=$m.StandbyCacheReserveBytes; ' +
    'ModifiedPageListBytes=$m.ModifiedPageListBytes; ' +
    'FreeAndZeroPageListBytes=$m.FreeAndZeroPageListBytes ' +
    '} | ConvertTo-Json -Compress',
];

const before = getMemoryInfo(t);
const counters = JSON.parse(execFileSync('powershell.exe', PS_ARGS, { encoding: 'utf8' }));
const after = getMemoryInfo(t);

const n = (value) => Number(value);
const standby =
  n(counters.StandbyCacheCoreBytes) +
  n(counters.StandbyCacheNormalPriorityBytes) +
  n(counters.StandbyCacheReserveBytes);
const taskManagerCached = standby + n(counters.ModifiedPageListBytes);

/** Report whether the OS value falls inside our two-sample interval. */
function bracket(label, oursA, oursB, theirs) {
  const lo = Math.min(oursA, oursB);
  const hi = Math.max(oursA, oursB);
  const inside = theirs >= lo && theirs <= hi;
  const nearest = theirs < lo ? lo : hi;
  const drift = inside ? 0 : Math.abs(theirs - nearest);
  const relative = theirs === 0 ? 0 : (drift / theirs) * 100;
  console.log(
    `${label.padEnd(16)} ours=[${gb(lo)} .. ${gb(hi)}]  os=${gb(theirs).padStart(11)}  ` +
      `${inside ? 'OK (inside interval)' : `off by ${mb(drift)} (${relative.toFixed(3)}%)`}`
  );
}

console.log('=== reading comparison ===');
bracket('physical free', before.physical.free, after.physical.free, n(counters.AvailableBytes));
bracket('commit used', before.pagefile.used, after.pagefile.used, n(counters.CommittedBytes));
bracket('commit limit', before.pagefile.total, after.pagefile.total, n(counters.CommitLimit));

console.log('\n=== system cache basis ===');
console.log('ours (standby + modified)  :', gb(before.systemCache.used));
console.log('Perf CacheBytes            :', gb(n(counters.CacheBytes)));
console.log('standby total              :', gb(standby));
console.log('modified page list         :', gb(n(counters.ModifiedPageListBytes)));
console.log('Task Manager cached        :', gb(taskManagerCached));
bracket('  vs cached', before.systemCache.used, after.systemCache.used, taskManagerCached);

console.log('\n=== physical memory, Task Manager basis ===');
console.log('total  :', gb(before.physical.total));
console.log('used   :', gb(before.physical.used), `(${before.physical.percent}%)`);
console.log('free   :', gb(before.physical.free));
console.log('zero   :', gb(n(counters.FreeAndZeroPageListBytes)));
