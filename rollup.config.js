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
  // UMD: for script tags; tree and host bundled in as twglTree.tree and
  // twglTree.host, twgl.js read from the global `twgl`.
  {
    input: 'src/umd.js',
    external: ['twgl.js'],
    output: {
      file: 'dist/twgl.tree.umd.cjs',
      format: 'umd',
      name: 'twglTree',
      globals: { 'twgl.js': 'twgl' },
      sourcemap: true
    },
    plugins: [resolve()]
  }
];
