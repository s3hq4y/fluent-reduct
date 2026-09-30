/**
 * Translation coverage check.
 *
 * `Translations` already makes a missing key a compile error; this catches the
 * complementary problems that types cannot see: keys no longer referenced by any
 * source file, and `{placeholder}` tokens that differ between locales.
 *
 * Run with `npm run verify:i18n`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'src', 'shared', 'i18n', 'locales');
const SOURCE_LOCALE = 'zh-CN';

const KEY_PATTERN = /^\s*'([\w.]+)':\s*'((?:[^'\\]|\\.)*)',\s*$/;
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** Collect source files that may reference translation keys. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function parseLocale(file) {
  const keys = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = KEY_PATTERN.exec(line);
    if (match) keys.set(match[1], match[2]);
  }
  return keys;
}

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]).sort();
}

function main() {
  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort();

  const locales = new Map(
    localeFiles.map((name) => [path.basename(name, '.ts'), parseLocale(path.join(LOCALES_DIR, name))])
  );

  const source = locales.get(SOURCE_LOCALE);
  if (!source) {
    console.error(`FATAL: source locale ${SOURCE_LOCALE} not found in ${LOCALES_DIR}`);
    process.exit(1);
  }

  let failed = false;

  // 1. Every locale must define exactly the source keys.
  for (const [code, keys] of locales) {
    const missing = [...source.keys()].filter((key) => !keys.has(key));
    const extra = [...keys.keys()].filter((key) => !source.has(key));
    if (missing.length || extra.length) {
      failed = true;
      console.error(`[${code}] key mismatch`);
      if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
      if (extra.length) console.error(`  extra:   ${extra.join(', ')}`);
    }
  }

  // 2. Placeholders must match the source, or translations silently drop values.
  for (const [code, keys] of locales) {
    if (code === SOURCE_LOCALE) continue;
    for (const [key, value] of keys) {
      const expected = placeholders(source.get(key) ?? '');
      const actual = placeholders(value);
      if (expected.join(',') !== actual.join(',')) {
        failed = true;
        console.error(
          `[${code}] placeholder mismatch for ${key}: expected {${expected.join(', ')}} got {${actual.join(', ')}}`
        );
      }
    }
  }

  // 3. Warn about keys nothing references any more.
  const referenced = new Set();
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const key of source.keys()) {
      if (content.includes(`'${key}'`)) referenced.add(key);
    }
  }
  const unused = [...source.keys()].filter((key) => !referenced.has(key));
  if (unused.length) {
    console.warn(`WARN: ${unused.length} unused key(s): ${unused.join(', ')}`);
  }

  if (failed) {
    process.exit(1);
  }
  console.log(
    `i18n OK: ${source.size} keys across ${locales.size} locale(s)` +
      (unused.length ? ` (${unused.length} unused)` : '')
  );
}

main();
