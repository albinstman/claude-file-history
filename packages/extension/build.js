const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  const outdir = path.join(__dirname, 'dist');

  // Build main extension bundle
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src/extension.ts')],
    outfile: path.join(outdir, 'extension.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: true,
  });

  // Copy hook scripts into dist/hooks/ so the extension can install them
  const hooksDistDir = path.join(__dirname, '..', 'hooks', 'dist');
  const destHooksDir = path.join(outdir, 'hooks');
  fs.mkdirSync(destHooksDir, { recursive: true });

  for (const file of ['session-start.js', 'post-tool-use.js', 'sql-wasm.wasm']) {
    const src = path.join(hooksDistDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(destHooksDir, file));
    }
  }

  // Copy sql.js WASM for the extension itself
  const wasmSource = require.resolve('sql.js/dist/sql-wasm.wasm');
  fs.copyFileSync(wasmSource, path.join(outdir, 'sql-wasm.wasm'));

  console.log('Extension built successfully');
}

build().catch((e) => { console.error(e); process.exit(1); });
