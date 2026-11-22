/**
 * @file Example runner — an editable code box and a live WebGL2 canvas per
 * `@example`, with a viewport-driven iframe lifecycle.
 * @license AGPL-3.0-only
 *
 * ES module on every page; no-op where there are no examples. The page's
 * configuration is the `application/json` block `#docs-config`
 * ({ twgl, lib, imports, index, editor }); the markup is the renderer's
 * `figure.example` (`textarea.source`, `[data-stage]`, `[data-run]`,
 * `[data-reset]`, and `data-mode="module"` on the ES modules demo).
 *
 * - Editor: the package's `mountEditor` over the source textarea, imported with
 *   a dynamic `import()` on a page that has one — a page without examples never
 *   asks for the bundle. Until the mount succeeds the textarea is the carrier:
 *   Run and Reset work from it, an edit made while the import is in flight is
 *   kept, and a failed import or mount leaves the textarea in place and marks
 *   the figure `data-editor="fallback"`.
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

const LIVE_MAX = 8;
const NEAR     = '300px 0px';   // mount when the figure is within this margin of the viewport
const FAR      = '1500px 0px';  // unmount once it is beyond this margin

const attr = (s) => String(s).replace(/"/g, '&quot;');

/**
 * The stage's colour, read from the page's own `--stage`: the sheet states it
 * once, for the box the figure shows and for the frame's backdrop, so the
 * frame never flashes a colour the sketch is not about to paint. It is fixed —
 * never the page theme — and it is the colour every example clears to.
 */
function stageColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim();
  return value || '#0a0a0e';
}

/** The page's configuration: read once from the JSON block, or null. */
function readConfig() {
  const block = document.getElementById('docs-config');
  if (!block) return null;
  try {
    return JSON.parse(block.textContent);
  } catch (_) {
    return null;
  }
}

/** The iframe document: pinned twgl and the bundle, or the import map, then the example. */
function srcdoc(cfg, code, module, stage) {
  const head = module
    ? `<script type="importmap">${JSON.stringify({ imports: cfg.imports })}</script>`
    : `<script src="${attr(cfg.twgl)}"></script>\n<script src="${attr(cfg.lib)}"></script>`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:${stage}}canvas{display:block}</style>
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

function start(cfg) {
  const figures = document.querySelectorAll('figure.example');
  if (!figures.length) return;

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
    f.srcdoc = srcdoc(cfg, code(r), r.module, stageColor());
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

  // ── The editor, where there is one to mount ───────────────────────────────

  /**
   * Import the bundle once and mount every box. The textarea has been carrying
   * Run and Reset until now: the import is started after the wiring, and its
   * failure is the fallback, not an unhandled rejection.
   */
  async function mountEditors() {
    let mountEditor;
    try {
      ({ mountEditor } = await import(new URL(cfg.editor, document.baseURI).href));
    } catch (_) {
      for (const r of runners.values()) r.figure.dataset.editor = 'fallback';
      return;
    }
    for (const r of runners.values()) {
      try {
        r.editor = mountEditor(r.textarea, { value: r.source, onRun: () => mount(r), wrap: false });
      } catch (_) {
        r.editor = null;
        r.figure.dataset.editor = 'fallback';
      }
      // The adapter handles a mount failure itself and hands back the textarea's
      // verbs; its marker is the one to carry up to the figure.
      if (r.textarea.dataset.editor === 'fallback') r.figure.dataset.editor = 'fallback';
    }
  }

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
    const reset = () => (r.editor ? r.editor.reset() : (textarea.value = r.source));

    runners.set(figure, r);
    near.observe(figure);
    far.observe(figure);

    figure.querySelector('[data-run]')?.addEventListener('click', run);
    figure.querySelector('[data-reset]')?.addEventListener('click', reset);
  }

  mountEditors();
}

const config = readConfig();
if (config) start(config);
