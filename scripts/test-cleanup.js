/**
 * 真实清理测试：逐区域执行，打印 NTSTATUS 与实际释放量。
 */
const { getMemoryInfo, cleanupMemory, getDiagnostics } = require('../dist/main/memory.js');

const gb = (n) => (n / 1024 ** 3).toFixed(3) + ' GB';
const mb = (n) => (n / 1024 ** 2).toFixed(1) + ' MB';

const AREAS = [
  'workingset',
  'systemfilecache',
  'modifiedfilecache',
  'standbypriority0',
  'standbylist',
  'modifiedlist',
  'combinememory',
  'registrycache',
];

(async () => {
  console.log('=== 环境 ===');
  console.log(getDiagnostics());

  const before = getMemoryInfo();
  console.log('\n清理前  可用物理:', gb(before.physical.free), ' 占用:', before.physical.percent + '%',
    ' 已缓存:', gb(before.systemCache.used));

  console.log('\n=== 逐区域执行 ===');
  const result = await cleanupMemory(AREAS, (p) => {
    process.stdout.write(`  [${p.index + 1}/${p.total}] ${p.label} ... `);
  });

  // 进度回调和结果是分开的，这里按顺序补打结果
  console.log('');
  for (const r of result.areaResults) {
    console.log(`  ${r.ok ? '✔' : 'x'} ${r.area.padEnd(18)} ${r.status}  ${r.message}`);
  }

  console.log('\n清理后  可用物理:', gb(result.after.physical.free), ' 占用:', result.after.physical.percent + '%',
    ' 已缓存:', gb(result.after.systemCache.used));

  console.log('\n=== 汇总 ===');
  console.log('管理员权限 :', result.elevated);
  console.log('实际释放   :', mb(result.freedMemory), `(${gb(result.freedMemory)})`);
  console.log('耗时       :', result.duration.toFixed(2), '秒');
  console.log('成功区域   :', result.areaResults.filter(r => r.ok).length, '/', result.areaResults.length);
  console.log('缓存变化   :', mb(before.systemCache.used - result.after.systemCache.used), '被释放');
})();
