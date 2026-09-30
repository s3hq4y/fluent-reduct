/**
 * Renderer build.
 *
 * Bundles the renderer TypeScript with esbuild and stages every runtime asset
 * into dist/. electron-builder only ships `dist/**` + `package.json`, so nothing
 * under src/ may be required at runtime.
 *
 * `src/ui/renderer/index.html` references `./styles/main.css` and `./app.js` -
 * i.e. paths relative to the built output - so the staged copy needs no
 * rewriting.
 */

const esbuild = require('esbuild');
const path = require('path');
const { copyFile, ensureDir, firstExisting } = require('./lib/fs-utils');

const isWatch = process.argv.includes('--watch');

const ROOT = path.join(__dirname, '..');
const RENDERER_SRC = path.join(ROOT, 'src', 'ui', 'renderer');
const RENDERER_OUT = path.join(ROOT, 'dist', 'renderer');
const ASSETS_OUT = path.join(ROOT, 'dist', 'assets');

/** Icons in preference order; the first that exists wins. */
const ICON_CANDIDATES = [path.join(ROOT, 'src', 'ui', 'assets', 'icon.ico')];

/** Static files copied verbatim into dist/renderer. */
const STATIC_FILES = [
  { from: path.join(RENDERER_SRC, 'index.html'), to: path.join(RENDERER_OUT, 'index.html') },
  {
    from: path.join(RENDERER_SRC, 'styles', 'main.css'),
    to: path.join(RENDERER_OUT, 'styles', 'main.css'),
  },
];

function stageAssets() {
  ensureDir(RENDERER_OUT);
  ensureDir(ASSETS_OUT);

  for (const file of STATIC_FILES) {
    copyFile(file.from, file.to);
  }

  const icon = firstExisting(ICON_CANDIDATES);
  if (icon) {
    copyFile(icon, path.join(ASSETS_OUT, 'icon.ico'));
  } else {
    console.warn('WARN: no icon.ico found; the app will use the default Electron icon');
  }

  console.log('Renderer assets staged into dist/');
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(RENDERER_SRC, 'app.ts')],
  outfile: path.join(RENDERER_OUT, 'app.js'),
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  minify: !isWatch,
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.rebuild();
    stageAssets();
    await ctx.watch();
    console.log('Watching renderer for changes...');
    return;
  }

  await esbuild.build(options);
  stageAssets();
  console.log('Renderer build complete');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
