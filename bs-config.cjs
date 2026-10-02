/**
 * browser-sync harness for webgl.tree's testing/ pages.
 *
 * The pages import twgl.js and the bridge through an import map that
 * resolves inside this repo (node_modules, dist), and load p5 + p5.tree for
 * the parity column via `../../p5.tree/dist/p5.tree.js`, which this config
 * mounts at /p5.tree — so a sibling p5.tree checkout has to be built first.
 *
 *   npx browser-sync start --config bs-config.cjs
 */
module.exports = {
  server: { baseDir: '.' },
  serveStatic: [
    { route: '/p5.tree', dir: '../p5.tree' },
  ],
  startPath: 'testing/index.html',
  files: ['testing/*.html', 'dist/*.js', '../p5.tree/dist/*.js'],
};
