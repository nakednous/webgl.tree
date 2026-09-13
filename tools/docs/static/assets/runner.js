/**
 * @file Example runner — an editable code box and a live WebGL2 canvas per
 * `@example`, with a viewport-driven iframe lifecycle.
 * @license AGPL-3.0-only
 *
 * Classic deferred script on every page; no-op where there are no examples.
 * Config arrives in `window.twglTreeDocs` ({ twgl, lib }); markup is the
 * renderer's `figure.example` (`textarea.source`, `[data-stage]`,
 * `[data-run]`, `[data-reset]`).
 *
 * - Editor: CodeMirror 5 over the source textarea; the bare textarea is the
 *   fallback when CodeMirror is absent.
 * - Canvas: a sandboxed `srcdoc` iframe whose import map sends `twgl.js` to
 *   the pinned CDN module and `twgl.tree` to the site-local bundle; the box
 *   contents run as a module script and make their own canvas. `srcdoc`
 *   inherits the page's base URL, so the bundle resolves relatively.
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

  const cfg     = window.twglTreeDocs;
  const figures = document.querySelectorAll('figure.example');
  if (!cfg || !figures.length) return;

  const LIVE_MAX = 8;
  const NEAR     = '300px 0px';   // mount when the figure is within this margin of the viewport
  const FAR      = '1500px 0px';  // unmount once it is beyond this margin
  const STAGE_BG = '#0a0a0e';     // fixed stage — never the page theme

  // `allow-same-origin` keeps the frame on the page's origin: the module
  // fetches of the site-local bundle and WebHID permissions both need a real
  // (non-opaque) origin. Drop it for a strict sandbox at the cost of both.
  const SANDBOX  = 'allow-scripts allow-same-origin';

  /** The iframe document: the import map, then the example as a module. */
  function srcdoc(code) {
    const map = JSON.stringify({ imports: { 'twgl.js': cfg.twgl, 'twgl.tree': cfg.lib } });
    return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:${STAGE_BG}}canvas{display:block}</style>
<script type="importmap">${map}</script>
</head><body>
<script type="module">
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
    } catch (_) { /* opaque origin under a stricter SANDBOX — removal has to do */ }
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
    f.setAttribute('sandbox', SANDBOX);
    f.setAttribute('allow', 'hid');
    f.srcdoc = srcdoc(code(r));
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
