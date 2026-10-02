/**
 * @file Docs generator configuration — pinned CDN versions and repo paths.
 * @module tools/docs/config
 * @license AGPL-3.0-only
 *
 * Every version below is an exact pin. Advancing one is a deliberate edit
 * here, never an implicit `latest`.
 */

const CDN = 'https://cdn.jsdelivr.net/npm';

/**
 * twgl.js — `url` is the script every example iframe loads before the bundle
 * (global `twgl`); `module` is what the ES modules demo maps `twgl.js` to.
 */
export const twgl = { version: '7.0.0' };
twgl.url    = `${CDN}/twgl.js@${twgl.version}/dist/7.x/twgl-full.js`;
twgl.module = `${CDN}/twgl.js@${twgl.version}/dist/7.x/twgl-full.module.js`;
twgl.reference = 'https://twgljs.org/docs/';

/**
 * twgl documents three of its namespaces on a module page of their own, and a
 * few of its functions off the module index every other anchor sits on.
 */
const twglNamespaces = ['m4', 'v3', 'primitives'];
const twglOwnPage = { setTextureFromElement: 'module-twgl_textures.html' };

/**
 * The twgl reference page of a `twgl.`-prefixed name: `twgl.createProgramInfo`
 * → module-twgl.html#.createProgramInfo, `twgl.m4.perspective` →
 * module-twgl_m4.html#.perspective, the namespace alone → its module page.
 * Null for anything else.
 */
export function twglRefUrl(name) {
  const m = /^twgl\.(?:([a-z]\w*)\.)?([\w$]+)$/.exec(name);
  if (!m) return null;
  const namespace = m[1];
  const fn = m[2];
  if (namespace) return `${twgl.reference}module-twgl_${namespace}.html#.${fn}`;
  if (twglNamespaces.includes(fn)) return `${twgl.reference}module-twgl_${fn}.html`;
  return `${twgl.reference}${twglOwnPage[fn] ?? 'module-twgl.html'}#.${fn}`;
}

/** The text a `twgl.`-prefixed link shows: the name as written (`twgl.setUniforms`). */
export const twglRefText = (name) => name;

/**
 * The stack's packages, named in prose or as a module's root: a mention links
 * to the repository that develops it — and `webgl.tree` itself, whose root
 * module has no page of its own, is the one address for the package's name.
 */
export const packages = {
  '@nakednous/tree': 'https://github.com/nakednous/tree',
  '@nakednous/host': 'https://github.com/nakednous/host',
  '@nakednous/ui':   'https://github.com/nakednous/ui',
  'twgl.js':         'https://twgljs.org/',
  'webgl.tree':      'https://github.com/nakednous/webgl.tree',
};

/** The address of a package named in prose, or null. */
export const packageRefUrl = (name) => packages[name] ?? null;

/** Class names in prose link to the factory that makes them. */
export const aliases = {};

/** Owners written as a prefix in signatures and constant names: `tree.mat4Mul`. */
export const namespaces = ['tree', 'host'];

/**
 * Where each owner of the re-exported surface lives in the build: a path
 * from the `webglTree` global, or `path()` for the object literal a factory
 * returns (its methods are read off the factory's source).
 */
export const owners = {
  tree:        'tree',
  host:        'host',
  Host:        'host.createHost()',
  Orbit:       'host.createOrbit()',
  Labels:      'host.createLabels()',
  Video:       'host.createVideo()',
  Handle:      'host.Handle.prototype',
  PoseTrack:   'tree.PoseTrack.prototype',
  CameraTrack: 'tree.CameraTrack.prototype',
  PoseHelm:    'tree.PoseHelm.prototype',
};

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
  esm:    'tools/docs/esm.md',  // the index page's ES modules section and its live demo
  docs:   'docs',               // doc-only files: the re-exported tree / host surface
  bundle: 'dist/webgl.tree.js', // IIFE build of the same commit, twgl.js read from the global
  module: 'dist/index.js',      // ES build of the same commit, for the ES modules demo
  deps: {                       // the builds the ES build was made against
    '@nakednous/tree': 'node_modules/@nakednous/tree/dist/index.js',
    '@nakednous/host': 'node_modules/@nakednous/host/dist/index.js',
  },
  static: 'tools/docs/static',  // copied verbatim into site/ (assets/)
  site:   'site',
};

/** Site-local URLs the pages hand to the runner. */
export const site = {
  bundle: 'webgl.tree.js',
  module: 'webgl.tree.esm.js',
  deps:   { '@nakednous/tree': 'tree.js', '@nakednous/host': 'host.js' },
  style:  'assets/style.css',
  runner: 'assets/runner.js',
  search: 'assets/search.js',
  index:  'search.json',
};
