/**
 * Renderer build script.
 *
 * Bundles the renderer TypeScript with esbuild and stages every runtime asset
 * into dist/, so that the packaged app stays self-contained: electron-builder
 * only ships `dist/**` + package.json, therefore nothing under src/ may be
 * required at runtime.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

const ROOT = path.join(__dirname, '..');
const RENDERER_SRC = path.join(ROOT, 'src', 'ui', 'renderer');
const RENDERER_OUT = path.join(ROOT, 'dist', 'renderer');
const ASSETS_OUT = path.join(ROOT, 'dist', 'assets');

function stageAssets() {
  fs.mkdirSync(path.join(RENDERER_OUT, 'styles'), { recursive: true });
  fs.mkdirSync(ASSETS_OUT, { recursive: true });

  // index.html -> dist/renderer/index.html, rewriting the authoring-time
  // "../../dist/renderer/..." references into dist-relative "./..." ones.
  let html = fs.readFileSync(path.join(RENDERER_SRC, 'index.html'), 'utf8');
  html = html.replace(/(?:\.\.\/)+dist\/renderer\//g, './');
  fs.writeFileSync(path.join(RENDERER_OUT, 'index.html'), html, 'utf8');

  // stylesheet
  fs.copyFileSync(
    path.join(RENDERER_SRC, 'styles', 'main.css'),
    path.join(RENDERER_OUT, 'styles', 'main.css')
  );

  // application icon: prefer the dedicated Electron asset, fall back to the
  // icon used by the native Win32 build.
  const iconCandidates = [
    path.join(ROOT, 'src', 'ui', 'assets', 'icon.ico'),
    path.join(ROOT, 'src', 'res', '100.ico')
  ];
  const icon = iconCandidates.find((p) => fs.existsSync(p));
  if (icon) {
    fs.copyFileSync(icon, path.join(ASSETS_OUT, 'icon.ico'));
  } else {
    console.warn('WARN: no icon.ico found; the app will use the default Electron icon');
  }

  console.log('Renderer assets staged into dist/');
}

async function build() {
  const ctx = await esbuild.context({
    entryPoints: [path.join(RENDERER_SRC, 'app.ts')],
    bundle: true,
    outfile: path.join(RENDERER_OUT, 'app.js'),
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    sourcemap: true,
    minify: !isWatch,
    define: {
      'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
    }
  });

  if (isWatch) {
    stageAssets();
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    stageAssets();
    console.log('Renderer build complete');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
