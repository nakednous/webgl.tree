/**
 * @file Example runner — an editable code box and a live WebGL2 canvas per
 * `@example`, with a viewport-driven iframe lifecycle.
 * @license AGPL-3.0-only
 *
 * Classic deferred script on every page; no-op where there are no examples.
 * Config arrives in `window.webglTreeDocs` ({ twgl, lib, imports, index });
 * markup is the renderer's `figure.example` (`textarea.source`,
 * `[data-stage]`, `[data-run]`, `[data-reset]`, and `data-mode="module"` on
 * the ES modules demo).
 *
 * - Editor: CodeMirror 5 over the source textarea; the bare textarea is the
 *   fallback when CodeMirror is absent.
 * - Canvas: a same-origin `srcdoc` iframe, unsandboxed (the examples are the
 *   site's own code; the runner reaches into each frame to release its WebGL
 *   context, and WebHID needs the page's origin). An example loads pinned
 *   twgl.js from the CDN and the site-local bundle as two scripts, then runs
 *   the box contents as a classic script reading the `webglTree` global. The
 *   module demo instead gets an import map — `twgl.js` to the pinned CDN
 *   module, the rest to site-local ES builds — and runs as a module script.
 *   `srcdoc` inherits the page's base URL, so site-local files resolve
 *   relatively.
 * - Run reassembles the iframe from the box; Reset restores the source text.
 *   Edits are page-local — nothing persists.
 * - Lifecycle: an IntersectionObserver mounts an iframe as its figure nears
 *   the viewport and unmounts it once far off-screen; at most LIVE_MAX are
 *   live at once, least recently neared out first. Unmounting stops the
 *   sketch and loses its WebGL context explicitly — Chromium caps concurrent
 *   contexts (~16).
 */

(function () {
  'use strict';

  const cfg     = window.webglTreeDocs;
  const figures = document.querySelectorAll('figure.example');
  if (!cfg || !figures.length) return;

  const LIVE_MAX = 8;
  const NEAR     = '300px 0px';   // mount when the figure is within this margin of the viewport
  const FAR      = '1500px 0px';  // unmount once it is beyond this margin
  const STAGE_BG = '#0a0a0e';     // fixed stage — never the page theme

  const attr = (s) => String(s).replace(/"/g, '&quot;');

  /** The iframe document: pinned twgl and the bundle, or the import map, then the example. */
  function srcdoc(code, module) {
    const head = module
      ? `<script type="importmap">${JSON.stringify({ imports: cfg.imports })}</script>`
      : `<script src="${attr(cfg.twgl)}"></script>\n<script src="${attr(cfg.lib)}"></script>`;
    return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:${STAGE_BG}}canvas{display:block}</style>
${head}
</head><body>
<script${module ? ' type="module"' : ''}>
${code.replace(/<\/(script)/gi, '<\\/$1')}
</script>
</body></html>`;
  }

  /** Release the example's WebGL context, then drop the frame. */
  function dispose(frame) {
    try {
      const canvas = frame.contentWindow.document.querySelector('canvas');
      const gl = canvas && canvas.getContext('webgl2');
      if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (_) { /* the frame's document is already gone — removal has to do */ }
    frame.remove();
  }

  function editorOf(textarea, run) {
    if (!window.CodeMirror) return null;
    return window.CodeMirror.fromTextArea(textarea, {
      mode:           'javascript',
      lineNumbers:    true,
      indentUnit:     2,
      tabSize:        2,
      viewportMargin: Infinity,   // render every line — the box grows to fit the sketch
      extraKeys:      { 'Ctrl-Enter': run, 'Cmd-Enter': run },
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  const runners = new Map();   // figure → runner
  const live    = [];          // mounted runners, least recently neared first

  const code = (r) => (r.editor ? r.editor.getValue() : r.textarea.value);

  function unmount(r) {
    if (!r.frame) return;
    dispose(r.frame);
    r.frame = null;
    const i = live.indexOf(r);
    if (i >= 0) live.splice(i, 1);
  }

  function mount(r) {
    unmount(r);
    while (live.length >= LIVE_MAX) unmount(live[0]);
    const f = document.createElement('iframe');
    f.className = 'sketch';
    f.title     = r.title;
    f.setAttribute('allow', 'hid' in navigator ? 'hid; camera' : 'camera');   // a browser without WebHID warns on the name
    f.srcdoc = srcdoc(code(r), r.module);
    r.stage.replaceChildren(f);
    r.frame = f;
    live.push(r);
  }

  function touch(r) {
    const i = live.indexOf(r);
    if (i >= 0) live.push(...live.splice(i, 1));
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const r = runners.get(e.target);
      r.frame ? touch(r) : mount(r);
    }
  }, { rootMargin: NEAR });

  const far = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) unmount(runners.get(e.target));
    }
  }, { rootMargin: FAR });

  // ── Wire every example ────────────────────────────────────────────────────

  for (const figure of figures) {
    const textarea = figure.querySelector('textarea.source');
    const stage    = figure.querySelector('[data-stage]');
    if (!textarea || !stage) continue;

    const r = {
      figure, stage, textarea,
      source: textarea.value,
      module: figure.dataset.mode === 'module',
      title:  figure.querySelector('figcaption')?.textContent.trim() || figure.id,
      editor: null,
      frame:  null,
    };
    const run   = () => mount(r);
    const reset = () => (r.editor ? r.editor.setValue(r.source) : (textarea.value = r.source));

    r.editor = editorOf(textarea, run);
    figure.querySelector('[data-run]')?.addEventListener('click', run);
    figure.querySelector('[data-reset]')?.addEventListener('click', reset);

    runners.set(figure, r);
    near.observe(figure);
    far.observe(figure);
  }
})();
