/**
 * Production-mode launcher: build, then run Electron with the project cwd.
 *
 * Exists (rather than `electron .` in package.json) so the child process gets a
 * sanitized environment; see lib/electron-env.js.
 */

const { spawn } = require('child_process');
const path = require('path');
const { electronEnv } = require('./lib/electron-env');

const ROOT = path.join(__dirname, '..');

const child = spawn(require('electron'), ['.', ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: false,
  env: electronEnv(),
});

child.on('exit', (code) => process.exit(code ?? 0));
