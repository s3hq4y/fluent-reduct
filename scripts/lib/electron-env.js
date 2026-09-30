/**
 * Environment helpers for launching Electron.
 */

/**
 * Environment for the Electron process.
 *
 * Electron must not inherit `ELECTRON_RUN_AS_NODE`: with it set, electron.exe
 * boots as plain Node, `require('electron')` resolves to the npm wrapper path
 * instead of the API, and the app dies immediately with
 * "Cannot read properties of undefined (reading 'whenReady')".
 * Some toolchains export it globally, so strip it before launching.
 */
function electronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

module.exports = { electronEnv };
