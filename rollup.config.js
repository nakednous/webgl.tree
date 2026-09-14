import resolve from '@rollup/plugin-node-resolve';

export default [
  // ESM: twgl.js, tree and host are the application's imports (an import map,
  // a bundler), so each loads once.
  {
    input: 'src/index.js',
    external: ['twgl.js', '@nakednous/tree', '@nakednous/host'],
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true
    }
  },
  // IIFE: for script tags; tree and host bundled in as webglTree.tree and
  // webglTree.host, twgl.js read from the global `twgl`.
  {
    input: 'src/index.js',
    external: ['twgl.js'],
    output: {
      file: 'dist/webgl.tree.js',
      format: 'iife',
      name: 'webglTree',
      globals: { 'twgl.js': 'twgl' },
      sourcemap: true
    },
    plugins: [resolve()]
  }
];
