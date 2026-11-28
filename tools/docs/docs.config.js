/**
 * @file The API site's declaration — what this site states, and nothing it does.
 * @module tools/docs/docs.config
 * @license AGPL-3.0-only
 *
 * `npm run docs` hands this object to `@nakednous/scholion/generator`, which
 * parses, validates, renders and writes the site. Add a field here to say
 * something; add a plugin to do something.
 *
 * Every version below is an exact pin. Advancing one is a deliberate edit
 * here, never an implicit `latest`.
 */

/**
 * twgl.js — `script` is what every example iframe loads before the bundle
 * (the global `twgl`); `module` is what an import map points `twgl.js` at.
 */
const twgl = {
  version: '7.0.0',
  script: 'dist/7.x/twgl-full.js',
  module: 'dist/7.x/twgl-full.module.js',
};

export default {
  /** Repo-relative paths: the inputs a build reads and the builds it copies. */
  paths: {
    pkg: 'package.json',
    readme: 'README.md',
    src: 'src',
    bundle: 'dist/webgl.tree.js',   // IIFE build of the same commit, twgl.js read from the global
    module: 'dist/index.js',        // ES build of the same commit, for the ES modules demo
    deps: {                         // the builds the ES build was made against
      '@nakednous/tree': 'node_modules/@nakednous/tree/dist/index.js',
      '@nakednous/host': 'node_modules/@nakednous/host/dist/index.js',
      '@nakednous/idiom': 'node_modules/@nakednous/idiom/dist/index.js',
    },
    static: 'tools/docs/static',    // copied verbatim into the site (assets/, models/)
    site: 'site',
  },

  /** What the build writes, as the page names it. */
  outputs: {
    bundle: 'webgl.tree.js',
    module: 'webgl.tree.esm.js',
    deps: { '@nakednous/tree': 'tree.js', '@nakednous/host': 'host.js', '@nakednous/idiom': 'idiom.js' },
    index: 'search.json',
    editor: 'assets',                                  // the editor bundle, under its content-hashed name
    notices: 'assets/editor.LICENSES.txt',             // the bundled packages' notices, served beside it
  },

  /** What a page is made of: doc-only sources, and the landing page's own section. */
  carrier: {
    docs: 'docs',                     // documentation-only files: the re-exported tree / host surface
    landing: { file: 'tools/docs/esm.md', section: 'esm', id: 'es-modules' },
  },

  /**
   * Publicity: the names `src/index.js` re-exports, no class members are public,
   * and an `@ignore` block stays off the site whatever it exports.
   */
  parse: { surface: true, members: null, ignore: 'skip' },

  /** Every example is a complete classic script reading the webglTree global. */
  examples: { syntax: 'global', global: 'webglTree', required: true },

  /** The build, evaluated once: an IIFE leaving `webglTree`, twgl.js stubbed at load. */
  surface: { global: 'webglTree', globals: { twgl: {} }, check: 'reexports' },

  /**
   * Where each owner of the re-exported surface lives in the build: a path from
   * the `webglTree` global, or `path()` for the object literal a factory
   * returns (its methods are read off the factory's source).
   */
  owners: {
    tree:        'tree',
    host:        'host',
    Host:        'host.createHost()',
    Orbit:       'host.createOrbit()',
    Look:        'host.createLook()',
    Labels:      'host.createLabels()',
    Video:       'host.createVideo()',
    Handle:      'host.Handle.prototype',
    PoseTrack:   'tree.PoseTrack.prototype',
    CameraTrack: 'tree.CameraTrack.prototype',
    PoseHelm:    'tree.PoseHelm.prototype',
  },

  /** Owners written as a prefix in signatures and constant names: `tree.mat4Mul`. */
  namespaces: ['tree', 'host'],

  /** The pinned third-party build a page loads, and the two artifacts it names. */
  pins: { 'twgl.js': twgl },

  /**
   * Where a name in prose resolves to. A package: the repository that develops
   * it — `webgl.tree` itself included, whose root module has no page of its own.
   * An external library: its documentation's base and a URL template per shape.
   */
  references: {
    packages: {
      '@nakednous/tree': 'https://github.com/nakednous/tree',
      '@nakednous/host': 'https://github.com/nakednous/host',
      '@nakednous/ui':   'https://github.com/nakednous/ui',
      'twgl.js':         'https://twgljs.org/',
      'webgl.tree':      'https://github.com/nakednous/webgl.tree',
      // the layer's repository is private, so its public address is the package page
      '@nakednous/idiom': 'https://www.npmjs.com/package/@nakednous/idiom',
    },
    externals: [{
      prefix: 'twgl',
      base: 'https://twgljs.org/docs/',
      url: {
        // twgl.createProgramInfo → module-twgl.html#.createProgramInfo,
        // twgl.m4 → module-twgl_m4.html, twgl.m4.perspective → module-twgl_m4.html#.perspective,
        // and three of its namespaces document on a module page of their own.
        qualified: 'module-twgl_{ns}.html#.{member}',
        one: 'module-twgl.html#.{member}',
        namespace: 'module-twgl_{member}.html',
        namespaces: ['m4', 'v3', 'primitives'],
        // a few functions document off the module index every other anchor sits on
        pages: { setTextureFromElement: 'module-twgl_textures.html#.{member}' },
      },
      text: '{name}',
    }],
  },

  /** The deployed address: a README link into it must name a page and a name this build writes. */
  home: 'https://jpcharalambosh.co/webgl.tree/',

  /** The page's own scripts are ES modules; the shell hands them a JSON config block. */
  mode: 'esm',

  shell: {
    // The rail's badge in place of the version line: on every page, and the
    // landing page keeps its space.
    badge: {
      src: 'https://img.shields.io/badge/dynamic/json?url=https://registry.npmjs.org/webgl.tree&query=$.dist-tags.latest&label=npm&color=0077a7',
      href: 'https://www.npmjs.com/package/webgl.tree',
    },
    stylesheet: 'assets/style.css',
    favicon: [
      { sizes: '32x32', href: 'favicon-32.png' },      // the p5.tree cube, cropped square
      { sizes: '128x128', href: 'favicon-128.png' },
    ],
  },

  /**
   * Every site-local asset URL carries the build stamp: a rebuild has to
   * invalidate what the browser cached, or the new pages run the old client —
   * the sheet, the scripts and the index the page fetches, and the builds the
   * frames import. A CDN pin is someone else's file and carries none.
   */
  stamp: true,

  /**
   * The runner's contract: the page's config block, its `{tokens}` resolved by
   * the build — `{bundle}`, `{module}`, `{index}`, `{editor}`, `{dep:<name>}`,
   * `{pin:<name>:<field>}`.
   */
  runner: {
    script: 'assets/runner.js',
    search: 'assets/search.js',
    chrome: 'assets/chrome.js',    // theme picker and collapsible navigation
    config: {
      twgl: '{pin:twgl.js:script}',
      lib: './{bundle}?v={stamp}',
      imports: {
        'twgl.js': '{pin:twgl.js:module}',
        'webgl.tree': './{module}?v={stamp}',
        '@nakednous/tree': './{dep:@nakednous/tree}?v={stamp}',
        '@nakednous/host': './{dep:@nakednous/host}?v={stamp}',
        '@nakednous/idiom': './{dep:@nakednous/idiom}?v={stamp}',
      },
      index: '{index}?v={stamp}',
      editor: '{editor}',
    },
  },

  /** This site keeps nothing inside the package's run. */
  plugins: [],
};
