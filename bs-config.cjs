/**
 * browser-sync harness for webgl.tree's testing/ pages.
 *
 * The pages import twgl.js and the bridge through an import map that
 * resolves inside this repo (node_modules, dist), and load p5 + p5.tree for
 * the parity column via `../../p5.tree/dist/p5.tree.js`, which this config
 * mounts at /p5.tree. The notebook heroes (toon, shadow) run the notebook's
 * own sketches, which fetch /sketches/… and /shaders/… at absolute paths; the
 * notebook's static folders are mounted there:
 *
 *   npx browser-sync start --config bs-config.cjs
 */
module.exports = {
  server: { baseDir: '.' },
  serveStatic: [
    { route: '/p5.tree', dir: '../p5.tree' },
    { route: '/sketches', dir: '../visualcomputing.github.io/static/sketches' },
    { route: '/shaders', dir: '../visualcomputing.github.io/static/shaders' },
  ],
  startPath: 'testing/index.html',
  files: ['testing/*.html', 'dist/*.js', '../p5.tree/dist/*.js'],
};
