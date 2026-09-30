/**
 * Development runner: build once, then watch both processes and launch Electron.
 *
 * Replaces the previous `concurrently ... "sleep 2 && electron ."` script, whose
 * `sleep` does not exist under cmd.exe / PowerShell.
 */

const { spawn } = require('child_process');
const path = require('path');
const { electronEnv } = require('./lib/electron-env');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const ELECTRON = require('electron');

/** @type {import('child_process').ChildProcess[]} */
const children = [];

function run(command, args, label, env) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    ...(env ? { env } : {}),
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${label} exited with code ${code}`);
    }
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

function main() {
  // Build once so Electron has something to load, then switch to watch mode.
  const build = spawn(NODE, [path.join(__dirname, 'build-main.js')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  build.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);

    run(NODE, [path.join(__dirname, 'build-renderer.js')], 'renderer build').on('exit', (rc) => {
      if (rc !== 0) process.exit(rc ?? 1);

      run(NODE, [path.join(__dirname, 'build-main.js'), '--watch'], 'main watch');
      run(NODE, [path.join(__dirname, 'build-renderer.js'), '--watch'], 'renderer watch');
      run(ELECTRON, ['.', '--dev'], 'electron', electronEnv());
    });
  });
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

main();
