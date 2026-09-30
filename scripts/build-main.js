/**
 * Main-process build.
 *
 * Bundles the main process and preload script with esbuild. Bundling (rather
 * than tsc emit) is what allows `src/shared` to be imported from both processes
 * while keeping the flat `dist/main/*.js` layout that `package.json#main`
 * expects.
 *
 * `memory` and `i18n/translate` are also emitted as standalone bundles so the
 * diagnostic CLIs in scripts/ can drive the same native layer and translations
 * the app uses, instead of reimplementing them.
 *
 * `packages: 'external'` keeps every node_modules import as a runtime require:
 * electron is provided by the runtime, and koffi / electron-store must stay
 * external because koffi loads a native `.node` binary.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./lib/fs-utils');

const isWatch = process.argv.includes('--watch');

const ROOT = path.join(__dirname, '..');
const MAIN_OUT = path.join(ROOT, 'dist', 'main');

// The object form maps each entry to `<outdir>/<key>.js`.
const ENTRY_POINTS = {
  main: path.join(ROOT, 'src', 'ui', 'main', 'main.ts'),
  preload: path.join(ROOT, 'src', 'ui', 'main', 'preload.ts'),
  memory: path.join(ROOT, 'src', 'ui', 'main', 'memory.ts'),
  'i18n/translate': path.join(ROOT, 'src', 'shared', 'i18n', 'translate.ts'),
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ENTRY_POINTS,
  outdir: MAIN_OUT,
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
};

async function build() {
  // Clear stale output (e.g. declaration files from a previous tsc emit) so the
  // directory always reflects the current entry point list.
  if (!isWatch) {
    fs.rmSync(MAIN_OUT, { recursive: true, force: true });
  }
  ensureDir(MAIN_OUT);

  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('Watching main process for changes...');
    return;
  }

  await esbuild.build(options);
  console.log('Main process build complete');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
