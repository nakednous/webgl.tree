/**
 * @file The density gate's page: one example, mounted as the docs site mounts it.
 * @module webgl.tree/tools/density/page
 * @license AGPL-3.0-only
 *
 * `page()` returns an HTML document holding one example's text verbatim, the
 * build beside it, and a recording seam: every `image()` rect and every
 * `gl.viewport` call made while the default framebuffer is bound lands in
 * `window.__density.rects`, and the page marks itself done two frames after
 * load. The gate compares those rects between two densities.
 *
 * @details
 * A script-tag page reads the IIFE build's `webglTree` global, which the
 * preamble patches before the example runs — the example destructures its
 * names afterwards, so it takes the patched ones. A module page has bindings
 * instead of a global, so the import map points `webgl.tree` at `.density-shim.js`,
 * a module that re-exports the build and overrides the two seams. A target's
 * own pixels are its own: a call made while a framebuffer is bound is not a
 * page-pixel rect and is not recorded.
 */

'use strict';

/** The recording seam, shared by the classic preamble and the module shim. */
const RECORD = `
  window.__density = { rects: [], error: null, done: false };
  window.addEventListener('error', (e) => { if (!window.__density.error) window.__density.error = String(e.message || e); });
  const note = (kind, rect) => { if (!window.__density.done) window.__density.rects.push(kind + ' [' + rect.join(', ') + ']'); };
`;

/** Patch a gl instance so its SCREEN viewports are recorded. */
const WATCH_GL = `
  function watch(gl) {
    if (gl.__densityWatched) return gl;
    Object.defineProperty(gl, '__densityWatched', { value: true });
    const vp = gl.viewport.bind(gl);
    gl.viewport = (x, y, w, h) => {
      if (gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) note('viewport', [x, y, w, h]);
      return vp(x, y, w, h);
    };
    return gl;
  }
`;

/** The script-tag page's preamble: the global's two seams, patched before the example runs. */
export const PREAMBLE = `(function () {
  ${RECORD}
  ${WATCH_GL}
  const lib = window.webglTree, createCanvas = lib.createCanvas, image = lib.image;
  lib.createCanvas = function () { return watch(createCanvas.apply(this, arguments)); };
  lib.image = function (gl, tex, o) {
    if (o && typeof o.width === 'number' && gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) {
      note('image', [o.x || 0, o.y || 0, o.width, o.height || 0]);
    }
    return image.apply(this, arguments);
  };
})();`;

/** The module shim: the build's names, with the same two seams wrapped. */
export const SHIM = `import * as lib from './.density-esm.js';
export * from './.density-esm.js';
${RECORD};
${WATCH_GL}
export const createCanvas = function () { return watch(lib.createCanvas.apply(this, arguments)); };
export const image = function (gl, tex, o) {
  if (o && typeof o.width === 'number' && gl.getParameter(gl.FRAMEBUFFER_BINDING) === null) {
    note('image', [o.x || 0, o.y || 0, o.width, o.height || 0]);
  }
  return lib.image.apply(this, arguments);
};`;

/** Two frames after load the page is as settled as a figure gets: mark it done. */
const TAIL = `<script>
addEventListener('load', () => {
  let n = 0;
  const step = () => { if (++n < 3) requestAnimationFrame(step); else window.__density.done = true; };
  requestAnimationFrame(step);
});
</script>`;

const HEAD = (title, extra) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>${title}</title>
<style>html, body { margin: 0; overflow: hidden; background: #0a0a0e } canvas { display: block }</style>
${extra}</head><body>`;

/**
 * The document of one example.
 * @param {{ title:string, code:string, mode?:'classic'|'module', imports?:object,
 *           twgl:string, lib:string }} opts  twgl / lib: the script sources a
 *        classic page loads; imports: the module page's import map.
 * @returns {string} html
 * @ignore
 */
export function page(opts) {
  const module = opts.mode === 'module';
  const head = module
    ? `<script type="importmap">${JSON.stringify({ imports: opts.imports })}</script>`
    : `<script src="${opts.twgl}"></script>\n<script src="${opts.lib}"></script>\n<script>${PREAMBLE}</script>`;
  const body = module ? `<script type="module">\n${opts.code}\n</script>` : `<script>\n${opts.code}\n</script>`;
  return `${HEAD(opts.title, head)}\n${body}\n${TAIL}\n</body></html>`;
}
