/**
 * Renderer build.
 *
 * Bundles each UI window with esbuild and stages every runtime asset into
 * dist/. electron-builder only ships `dist/**` + `package.json`, so nothing
 * under src/ may be required at runtime.
 *
 * Each window declares its own entry point and static files, so adding a window
 * is one entry in WINDOWS below rather than a new build script.
 */

const esbuild = require('esbuild');
const path = require('path');
const { copyFile, ensureDir, firstExisting } = require('./lib/fs-utils');

const isWatch = process.argv.includes('--watch');

const ROOT = path.join(__dirname, '..');
const UI_SRC = path.join(ROOT, 'src', 'ui');
const DIST = path.join(ROOT, 'dist');
const ASSETS_OUT = path.join(DIST, 'assets');

/** Icons in preference order; the first that exists wins. */
const ICON_CANDIDATES = [path.join(UI_SRC, 'assets', 'icon.ico')];

/**
 * Every renderer window: where it is built from, where it lands, and which
 * static files it needs copied verbatim.
 *
 * `index.html` references `./app.js` / `./ball.js` and `./styles/main.css`, i.e.
 * paths relative to the built output, so the staged copies need no rewriting.
 */
const WINDOWS = [
  {
    name: 'renderer',
    outDir: path.join(DIST, 'renderer'),
    entry: path.join(UI_SRC, 'renderer', 'app.ts'),
    staticFiles: [
      { from: path.join(UI_SRC, 'renderer', 'index.html'), to: 'index.html' },
      { from: path.join(UI_SRC, 'renderer', 'styles', 'main.css'), to: 'styles/main.css' },
    ],
  },
  {
    name: 'ball',
    outDir: path.join(DIST, 'ball'),
    entry: path.join(UI_SRC, 'ball', 'ball.ts'),
    staticFiles: [{ from: path.join(UI_SRC, 'ball', 'index.html'), to: 'index.html' }],
  },
];

function stageAssets() {
  ensureDir(ASSETS_OUT);

  for (const window of WINDOWS) {
    ensureDir(window.outDir);
    for (const file of window.staticFiles) {
      copyFile(file.from, path.join(window.outDir, file.to));
    }
  }

  const icon = firstExisting(ICON_CANDIDATES);
  if (icon) {
    copyFile(icon, path.join(ASSETS_OUT, 'icon.ico'));
  } else {
    console.warn('WARN: no icon.ico found; the app will use the default Electron icon');
  }

  console.log('Renderer assets staged into dist/');
}

/** @type {import('esbuild').BuildOptions[]} */
const buildOptions = WINDOWS.map((window) => ({
  entryPoints: [window.entry],
  outfile: path.join(window.outDir, path.basename(window.entry).replace(/\.ts$/, '.js')),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  minify: !isWatch,
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
}));

async function build() {
  if (isWatch) {
    const contexts = await Promise.all(buildOptions.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((context) => context.rebuild()));
    stageAssets();
    await Promise.all(contexts.map((context) => context.watch()));
    console.log('Watching renderer windows for changes...');
    return;
  }

  await Promise.all(buildOptions.map((options) => esbuild.build(options)));
  stageAssets();
  console.log('Renderer build complete');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
