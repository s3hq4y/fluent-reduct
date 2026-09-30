/**
 * Remove build output. Cross-platform replacement for `rm -rf dist release`,
 * which does not run under cmd.exe / PowerShell.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = ['dist', 'release'];

for (const target of TARGETS) {
  const full = path.join(ROOT, target);
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`removed ${target}/`);
}
