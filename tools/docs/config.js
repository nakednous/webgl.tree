/**
 * @file Docs generator configuration — pinned CDN versions and repo paths.
 * @module tools/docs/config
 * @license AGPL-3.0-only
 *
 * Every version below is an exact pin. Advancing one is a deliberate edit
 * here, never an implicit `latest`.
 */

const CDN = 'https://cdn.jsdelivr.net/npm';

/** twgl.js — the ES module every example iframe maps `twgl.js` to. */
export const twgl = { version: '7.0.0' };
twgl.url = `${CDN}/twgl.js@${twgl.version}/dist/7.x/twgl-full.module.js`;
twgl.reference = 'https://twgljs.org/docs/';

/**
 * The twgl reference page of a `twgl.`-prefixed name: `twgl.createProgramInfo`
 * → module-twgl.html#.createProgramInfo, `twgl.m4.perspective` →
 * module-twgl_m4.html#.perspective. Null for anything else.
 */
export function twglRefUrl(name) {
  const m = /^twgl\.(?:([a-z]\w*)\.)?([\w$]+)$/.exec(name);
  if (!m) return null;
  return `${twgl.reference}module-twgl${m[1] ? '_' + m[1] : ''}.html#.${m[2]}`;
}

/** The text a `twgl.`-prefixed link shows: the name as written (`twgl.setUniforms`). */
export const twglRefText = (name) => name;

/** Class names in prose link to the factory that makes them. */
export const aliases = {};

/** CodeMirror 5 UMD — the example editor. */
export const codemirror = { version: '5.65.21' };
codemirror.css = `${CDN}/codemirror@${codemirror.version}/lib/codemirror.min.css`;
codemirror.js  = [
  `${CDN}/codemirror@${codemirror.version}/lib/codemirror.min.js`,
  `${CDN}/codemirror@${codemirror.version}/mode/javascript/javascript.min.js`,
];

/** Repo-relative paths (resolved against the package root by index.js). */
export const paths = {
  src:    'src',
  pkg:    'package.json',
  readme: 'README.md',
  bundle: 'dist/index.js',      // ES build of the same commit, twgl.js external
  deps: {                       // the builds the bundle was made against
    '@nakednous/tree': 'node_modules/@nakednous/tree/dist/index.js',
    '@nakednous/host': 'node_modules/@nakednous/host/dist/index.js',
  },
  static: 'tools/docs/static',  // copied verbatim into site/ (assets/)
  site:   'site',
};

/** Site-local URLs the pages hand to the runner. */
export const site = {
  bundle: 'webgl.tree.js',
  deps:   { '@nakednous/tree': 'tree.js', '@nakednous/host': 'host.js' },
  style:  'assets/style.css',
  runner: 'assets/runner.js',
  search: 'assets/search.js',
  index:  'search.json',
};
