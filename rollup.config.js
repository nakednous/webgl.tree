import resolve from '@rollup/plugin-node-resolve';

// twgl.js is a peer: the application supplies it (an import map, a bundler),
// so it stays an external import; tree and host are bundled in.
export default {
  input: 'src/index.js',
  external: ['twgl.js'],
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [resolve()]
};
