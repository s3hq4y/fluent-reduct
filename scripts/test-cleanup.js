/**
 * Real cleanup test: runs every area, printing the NTSTATUS and the amount
 * actually freed.
 *
 * Uses the same compiled native layer and translations as the app, so it can
 * never drift from production behaviour.
 */

const { createTranslator } = require('../dist/main/i18n/translate.js');
const {
  getMemoryInfo,
  cleanupMemory,
  getDiagnostics,
  areaLabel,
} = require('../dist/main/memory.js');

const t = createTranslator(process.env.FLUENT_REDUCT_LOCALE || 'zh-CN');

const gb = (n) => `${(n / 1024 ** 3).toFixed(3)} GB`;
const mb = (n) => `${(n / 1024 ** 2).toFixed(1)} MB`;

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
  console.log('=== environment ===');
  console.log(getDiagnostics(t));

  const before = getMemoryInfo(t);
  console.log(
    '\nbefore   free:',
    gb(before.physical.free),
    ' used:',
    `${before.physical.percent}%`,
    ' cached:',
    gb(before.systemCache.used)
  );

  console.log('\n=== running each area ===');
  const result = await cleanupMemory(AREAS, t, (progress) => {
    process.stdout.write(`  [${progress.index + 1}/${progress.total}] ${progress.label} ... `);
  });
  process.stdout.write('\n');

  for (const entry of result.areaResults) {
    console.log(`  ${entry.ok ? 'OK  ' : 'FAIL'} ${entry.area.padEnd(18)} ${entry.status}  ${entry.message}`);
  }

  console.log(
    '\nafter    free:',
    gb(result.after.physical.free),
    ' used:',
    `${result.after.physical.percent}%`,
    ' cached:',
    gb(result.after.systemCache.used)
  );

  console.log('\n=== summary ===');
  console.log('elevated      :', result.elevated);
  console.log('freed         :', mb(result.freedMemory), `(${gb(result.freedMemory)})`);
  console.log('duration      :', result.duration.toFixed(2), 's');
  console.log(
    'areas ok      :',
    result.areaResults.filter((entry) => entry.ok).length,
    '/',
    result.areaResults.length
  );
  console.log('cache released:', mb(before.systemCache.used - result.after.systemCache.used));

  // Reference areaLabel so the exported helper stays exercised.
  void areaLabel('workingset', t);
})();
