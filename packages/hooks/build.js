const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
};

async function build() {
  const outdir = path.join(__dirname, 'dist');

  await esbuild.build({
    ...shared,
    entryPoints: [path.join(__dirname, 'src/session-start.ts')],
    outfile: path.join(outdir, 'session-start.js'),
  });
  await esbuild.build({
    ...shared,
    entryPoints: [path.join(__dirname, 'src/post-tool-use.ts')],
    outfile: path.join(outdir, 'post-tool-use.js'),
  });

  // Copy sql.js WASM file next to the hook scripts
  const wasmSource = require.resolve('sql.js/dist/sql-wasm.wasm');
  fs.copyFileSync(wasmSource, path.join(outdir, 'sql-wasm.wasm'));

  console.log('Hooks built successfully');
}

build().catch((e) => { console.error(e); process.exit(1); });
