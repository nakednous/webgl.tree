#!/usr/bin/env node
/**
 * @file The docs site's browser probe — what no node test can see: a real
 * engine, real layout, real keys and a real theme switch.
 * @module webgl.tree/tools/docs/browser-check
 * @license AGPL-3.0-only
 *
 * `node tools/docs/browser-check.mjs` serves `site/` (so `npm run docs` comes
 * first) and drives headless Chromium over CDP, with no dependency: Node's own
 * WebSocket speaks the protocol, as the density gate does. It checks, in one
 * run:
 *
 *   - every page's JSON config names the editor asset the build wrote;
 *   - every figure mounts exactly one editor and hides its textarea, on every
 *     page with examples, with no page error and no `data-editor="fallback"`
 *     (the detailed checks below run on the longest page and on the index
 *     page's ES-modules demo);
 *   - two editors on one page keep separate documents;
 *   - Mod-Enter runs the sketch once, without touching the source;
 *   - undo and redo drive the editor's own history;
 *   - Reset restores the served source byte for byte, and Run hands that text
 *     to the frame's `srcdoc`;
 *   - an edit typed while a delayed import is in flight survives the mount, and
 *     Reset still goes back to the served source;
 *   - an editor that 404s leaves every textarea visible and usable, marks each
 *     figure `data-editor="fallback"` and raises no unhandled rejection;
 *   - tokens, caret, gutter and selection carry colours in both themes, and a
 *     live switch repaints them without rebuilding a view (`editor-ready`,
 *     measured from navigation start, is reported with the asset's bytes);
 *   - the longest sketch renders its last line inside the editor's box, the
 *     boxes grow with their content, and no editor wraps;
 *   - the index page's demo runs as a module, its import map intact.
 *
 * Limits, stated: it judges presence, geometry and computed colour, not taste —
 * it never looks at a pixel; and it reads documents through the rendered lines
 * (`cm-line` text, joined by newlines), which is the text a reader sees.
 *
 * Options: `--shots <dir>` writes the two theme screenshots (a fresh load of the
 * longest page, scrolled to its first figure), `--css <file>` injects a
 * stylesheet into that load — a design experiment, shot but not judged — and
 * `--json` prints the report.
 */

import {
  createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = (p) => join(root, p);
const site = at('site');
const SLOW_MS = 1500;

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SHOTS = opt('--shots', '');
const SHOT_CSS = opt('--css', '');
const JSON_OUT = args.includes('--json');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.obj': 'text/plain',
  '.hdr': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const k = (n) => `${(n / 1024).toFixed(1)} kB`;

// ── The site, served with two fault modes ───────────────────────────────────

const isEditorAsset = (path) => /\/assets\/editor\.[0-9a-f]+\.js$/.test(path);

/**
 * Serve `site/` with the prefixes the probe needs: `/__slow/…` delays the
 * editor asset, `/__absent/…` 404s it, everything else is the plain site. A
 * page's relative URLs follow its prefix, so the fault applies to the real
 * request the runner makes.
 */
function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const mode = url.startsWith('/__slow/') ? 'slow' : url.startsWith('/__absent/') ? 'absent' : 'plain';
    const path = mode === 'plain' ? url : url.slice(`/__${mode}/`.length - 1);
    const file = normalize(join(site, path === '/' ? '/index.html' : path));
    if (!file.startsWith(site) || !existsSync(file)) {
      res.writeHead(404); res.end('not found'); return;
    }
    const send = () => {
      if (mode === 'absent' && isEditorAsset(path)) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    };
    if (mode === 'slow' && isEditorAsset(path)) setTimeout(send, SLOW_MS); else send();
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((closed) => server.close(closed)),
  })));
}

// ── Chromium over CDP ───────────────────────────────────────────────────────

const CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const bin of CANDIDATES) {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (!r.error && r.status === 0) return bin;
  }
  return null;
}

/** The recording seam every page gets before its own scripts run. */
const PROBE_SCRIPT = `
  window.__probe = { editorAt: null, editors: 0, seen: 0, errors: [], console: [] };
  addEventListener('error', (e) => window.__probe.errors.push(String((e && e.message) || e)));
  addEventListener('unhandledrejection', (e) => window.__probe.errors.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
  const tick = () => {
    const n = document.querySelectorAll('.cm-editor').length;
    if (n) {
      if (window.__probe.editorAt === null) window.__probe.editorAt = performance.now();
      window.__probe.editors = n;
      window.__probe.seen = Math.max(window.__probe.seen, n);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
`;

/** A headless browser at device scale factor 1, its own profile, extensions off. */
async function launch() {
  const bin = findChrome();
  if (!bin) throw new Error('[probe] no Chromium found — set CHROME_BIN to one.');
  const profile = mkdtempSync(join(tmpdir(), 'webgl-tree-probe-'));
  const proc = spawn(bin, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--force-device-scale-factor=1', '--window-size=1400,1000',
    '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const file = join(profile, 'DevToolsActivePort');
  let lines = null;
  for (let i = 0; i < 200 && !lines; i++) {
    await sleep(50);
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8').split('\n');
      if (text[0] && text[1]) lines = text;
    }
  }
  if (!lines) { proc.kill(); throw new Error('[probe] Chromium did not open its debugging port.'); }

  const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('[probe] the CDP socket refused.')); });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (message) => {
    const msg = JSON.parse(message.data);
    if (!msg.id) { events.push(msg); return; }
    if (!pending.has(msg.id)) return;
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? fail(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const n = ++id;
    pending.set(n, { ok, fail });
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const at$ = (method, params) => send(method, params, sessionId);
  await at$('Page.enable');
  await at$('Runtime.enable');
  await at$('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SCRIPT });

  /** Evaluate a page expression and return its JSON value. */
  async function evaluate(expression) {
    const r = await at$('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluation failed');
    return r.result.value;
  }

  /** Navigate and wait for the page's load event. */
  async function navigate(url, timeout = 15000) {
    await at$('Page.navigate', { url });
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate('document.readyState').catch(() => 'loading') === 'complete') return;
      await sleep(40);
    }
    throw new Error(`[probe] ${url} did not load`);
  }

  /** Poll an expression until it is truthy, or throw. */
  async function waitFor(expression, description, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(expression).catch(() => false)) return;
      await sleep(40);
    }
    throw new Error(`[probe] timed out waiting for ${description}`);
  }

  const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

  /** A real key press: down, then up, with the modifier bits Chromium expects. */
  async function key({ key: name, code, vk, modifiers = [], text }) {
    const mask = modifiers.reduce((m, one) => m | (MODIFIERS[one] ?? 0), 0);
    const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mask };
    await at$('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
    await at$('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  const KEYS = {
    enter: { key: 'Enter', code: 'Enter', vk: 13 },
    tab: { key: 'Tab', code: 'Tab', vk: 9 },
    a: { key: 'a', code: 'KeyA', vk: 65 },
    y: { key: 'y', code: 'KeyY', vk: 89 },
    z: { key: 'z', code: 'KeyZ', vk: 90 },
    home: { key: 'Home', code: 'Home', vk: 36 },
    escape: { key: 'Escape', code: 'Escape', vk: 27 },
  };

  /** One printable character through the keyboard, the way a browser types it. */
  const type = (char) => key({
    key: char, code: `Key${char.toUpperCase()}`, vk: char.toUpperCase().charCodeAt(0),
    text: char, modifiers: char === char.toUpperCase() ? ['shift'] : [],
  });

  /** Click an element by dispatching a real mouse press and release on it. */
  async function click(selector, index = 0) {
    const found = await evaluate(`(() => {
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return { error: 'missing' };
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { error: 'no box' };
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, hit: Boolean(hit && (hit === el || el.contains(hit))),
               tag: el.tagName + '.' + el.className, hitTag: hit ? hit.tagName + '.' + hit.className : 'none',
               box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    })()`);
    if (found.error) throw new Error(`[probe] ${selector}[${index}]: ${found.error}`);
    if (!found.hit) {
      throw new Error(`[probe] ${selector}[${index}] is at [${found.box}] but ${found.hitTag} is on top of it`);
    }
    const point = { x: found.x, y: found.y, button: 'left', clickCount: 1 };
    await at$('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await at$('Input.dispatchMouseEvent', { type: 'mousePressed', ...point });
    await at$('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point });
  }

  async function screenshot(path) {
    const { data } = await at$('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
  }

  /** Scroll an element into view and give the engine a frame to settle. */
  async function settle(frames = 3) {
    await evaluate(`new Promise((done) => {
      let n = 0;
      const step = () => (++n >= ${frames} ? done(true) : requestAnimationFrame(step));
      requestAnimationFrame(step);
    })`);
  }

  async function close() {
    try { ws.close(); } catch (_) { /* already gone */ }
    proc.kill();
    await sleep(100);
    try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* a busy profile is the OS's */ }
  }

  return { evaluate, navigate, waitFor, key, type, click, screenshot, settle, close, KEYS, events };
}

// ── Page readers ────────────────────────────────────────────────────────────

/** The document of the editor at `index`, read through its rendered lines. */
const readDoc = (index) => `(() => {
  const line = (el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\\n');
  const editors = document.querySelectorAll('.cm-editor');
  return editors[${index}] ? line(editors[${index}]) : null;
})()`;

/** Computed colours the theme is judged by: token, caret, gutter, selection, surface. */
const THEME_STYLES = `(() => {
  const editor = document.querySelector('.cm-editor');
  const token = [...editor.querySelectorAll('.cm-line span')].find((s) => s.textContent === 'const' || s.textContent === 'let' || s.textContent === 'function');
  const cursor = editor.querySelector('.cm-cursor');
  const selection = editor.querySelector('.cm-selectionBackground');
  const comment = [...document.querySelectorAll('.cm-editor .cm-line span')].find((span) => span.textContent.startsWith('//'));
  const gutter = editor.querySelector('.cm-gutters');
  const content = editor.querySelector('.cm-content');
  const css = (el) => (el ? getComputedStyle(el) : null);
  return {
    theme: document.documentElement.dataset.theme,
    token: token ? css(token).color : null,
    caret: cursor ? css(cursor).borderLeftColor : null,
    comment: comment ? css(comment).fontStyle : null,
    gutterBg: css(gutter).backgroundColor,
    gutterColor: css(gutter).color,
    selection: selection ? css(selection).backgroundColor : null,
    surface: css(editor).backgroundColor,
    pageInk: css(document.body).color,
    sidebarBg: css(document.querySelector('.sidebar')).backgroundColor,
    editors: document.querySelectorAll('.cm-editor').length,
    node: (window.__probe.node = window.__probe.node || editor),
    sameNode: window.__probe.node === editor,
  };
})()`;

// ── The run ─────────────────────────────────────────────────────────────────

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  const mark = ok ? '✔' : '✗';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Every built page: its config names the asset the build wrote. */
function staticPass() {
  // Dot-files are another gate's temporary pages (the density check writes them into site/).
  const pages = readdirSync(site).filter((f) => f.endsWith('.html') && !f.startsWith('.')).sort();
  const problems = [];
  const listed = [];
  let withExamples = 0;
  let examples = 0;
  let bytes = 0;
  let longest = { page: null, bytes: 0, examples: 0 };
  for (const page of pages) {
    const html = readFileSync(join(site, page), 'utf8');
    const block = /<script type="application\/json" id="docs-config">([\s\S]*?)<\/script>/.exec(html);
    if (!block) { problems.push(`${page}: no config block`); continue; }
    let cfg;
    try { cfg = JSON.parse(block[1]); } catch (_) { problems.push(`${page}: the config is not JSON`); continue; }
    const sources = [...html.matchAll(/<textarea class="source"[^>]*>([\s\S]*?)<\/textarea>/g)];
    const sourceBytes = sources.reduce((n, m) => n + m[1].length, 0);
    bytes += sourceBytes;
    if (sources.length) {
      listed.push({ page, sources: sources.length });
      withExamples += 1;
      examples += sources.length;
      if (sourceBytes > longest.bytes) longest = { page, bytes: sourceBytes, examples: sources.length };
    }
    if (!/editor\.[0-9a-f]+\.js$/.test(cfg.editor ?? '')) problems.push(`${page}: editor URL "${cfg.editor}"`);
    if (!html.includes('<script type="module" src="assets/runner.js">')) problems.push(`${page}: runner is not a module`);
    if (/codemirror/i.test(html)) problems.push(`${page}: a CodeMirror reference survives`);
    if (/webglTreeDocs/.test(html)) problems.push(`${page}: the page still writes a global config`);
  }
  return { pages: pages.length, withExamples, examples, bytes, longest, problems, listed };
}

/**
 * Every page with examples, in turn: the mount, the hidden textareas, the
 * fallback marks and the page's own errors.
 */
async function sweepPass(browser, base, listed) {
  const problems = [];
  let editors = 0;
  for (const { page, sources } of listed) {
    await browser.navigate(`${base}/${page}`);
    try {
      await browser.waitFor(`document.querySelectorAll('.cm-editor').length === ${sources}`,
        `${page}: ${sources} editor(s)`, 20000);
    } catch (error) {
      problems.push(`${page}: ${error.message.replace(/^\[probe\] /, '')}`);
      continue;
    }
    const state = await browser.evaluate(`({
      editors: document.querySelectorAll('.cm-editor').length,
      sources: document.querySelectorAll('textarea.source').length,
      hidden: [...document.querySelectorAll('textarea.source')].filter((t) => t.hidden).length,
      fallbacks: document.querySelectorAll('[data-editor="fallback"]').length,
      errors: window.__probe.errors.slice(),
    })`);
    editors += state.editors;
    if (state.editors !== state.sources) problems.push(`${page}: ${state.editors}/${state.sources} editors`);
    if (state.hidden !== state.sources) problems.push(`${page}: ${state.hidden}/${state.sources} hidden`);
    if (state.fallbacks) problems.push(`${page}: ${state.fallbacks} fallback`);
    if (state.errors.length) problems.push(`${page}: ${state.errors.join(' | ')}`);
  }
  check('every page with examples mounts one editor per figure, cleanly',
    problems.length === 0,
    `${listed.length} page(s), ${editors} editor(s)` + (problems.length ? ` — ${problems.slice(0, 4).join('; ')}` : ''));
  return problems;
}

/** The index page's demo: an editor, Mod-Enter, and a module frame. */
async function modulePass(browser, base) {
  await browser.navigate(`${base}/index.html`);
  await browser.waitFor("document.querySelectorAll('.cm-editor').length === 1", 'the demo\'s editor', 15000);
  await browser.click('.cm-content', 0);
  await browser.key({ ...browser.KEYS.enter, modifiers: ['ctrl'] });
  await browser.waitFor("document.querySelector('figure.example [data-stage] iframe')", 'the demo frame', 15000);
  const frame = await browser.evaluate(`(() => {
    const f = document.querySelector('figure.example [data-stage] iframe');
    const source = document.querySelector('textarea.source').value;
    return {
      importmap: f.srcdoc.includes('type="importmap"'),
      module: f.srcdoc.includes('<script type="module">'),
      source: f.srcdoc.includes(source.slice(0, 40)),
    };
  })()`);
  check('index.html: the ES-modules demo runs as a module, import map intact',
    frame.importmap && frame.module && frame.source,
    `import map ${frame.importmap}, module script ${frame.module}, source ${frame.source}`);
  return frame;
}

/** One page: the mount, two editors, the keys, the reset and the themes. */
async function pagePass(browser, base, page, { detailed }) {
  const url = `${base}/${page}`;

  // ── mount ────────────────────────────────────────────────────────────────
  await browser.navigate(url);
  const figures = await browser.evaluate("document.querySelectorAll('figure.example').length");
  const sources = await browser.evaluate("document.querySelectorAll('textarea.source').length");
  await browser.waitFor('window.__probe.editors >= ' + Math.min(sources, 1), `${page}'s first editor`, 10000);
  await browser.waitFor(`document.querySelectorAll('.cm-editor').length === ${sources}`,
    `${page}: ${sources} editor(s)`, 15000);

  const mounted = await browser.evaluate(`({
    editors: document.querySelectorAll('.cm-editor').length,
    sources: document.querySelectorAll('textarea.source').length,
    figures: document.querySelectorAll('figure.example').length,
    fallbacks: document.querySelectorAll('[data-editor="fallback"]').length,
    hidden: [...document.querySelectorAll('textarea.source')].filter((t) => t.hidden).length,
    errors: window.__probe.errors.slice(),
    ready: window.__probe.editorAt,
    asset: (() => {
      const e = performance.getEntriesByType('resource').find((one) => /assets\\/editor\\.[0-9a-f]+\\.js/.test(one.name));
      return e ? { name: e.name, duration: e.duration, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize } : null;
    })(),
  })`);

  check(`${page}: every figure mounts one editor`,
    mounted.editors === mounted.sources && mounted.figures === mounted.sources,
    `${mounted.editors} editor(s), ${mounted.sources} textarea(s), ${mounted.figures} figure(s)`);
  check(`${page}: every textarea is hidden once its editor is in`, mounted.hidden === mounted.sources,
    `${mounted.hidden}/${mounted.sources}`);
  check(`${page}: nothing fell back`, mounted.fallbacks === 0);
  check(`${page}: no page error and no unhandled rejection`, mounted.errors.length === 0,
    mounted.errors.slice(0, 3).join(' | '));

  if (!detailed) return { mounted };

  // ── two editors, and typing into the first only ───────────────────────────
  if (mounted.editors >= 2) {
    const before = await browser.evaluate(`[${readDoc(0)}, ${readDoc(1)}]`);
    await browser.click('.cm-content', 0);
    await browser.type('x');
    await browser.settle();
    const after = await browser.evaluate(`[${readDoc(0)}, ${readDoc(1)}]`);
    check(`${page}: two editors on one page keep separate documents`,
      after[0] !== before[0] && after[1] === before[1],
      `first line ${JSON.stringify(after[0].slice(0, 12))} / ${JSON.stringify(after[1].slice(0, 12))}`);
    await browser.key({ ...browser.KEYS.z, modifiers: ['ctrl'] });
    await browser.key({ ...browser.KEYS.a, modifiers: ['ctrl'] });
  }

  // ── Mod-Enter: runs once, source unchanged ────────────────────────────────
  await browser.evaluate(`(() => {
    window.__probe.mounts = 0;
    const stage = document.querySelector('figure.example [data-stage]');
    new MutationObserver((list) => {
      for (const m of list) for (const node of m.addedNodes) if (node.tagName === 'IFRAME') window.__probe.mounts += 1;
    }).observe(stage, { childList: true });
  })()`);
  const beforeEnter = await browser.evaluate(readDoc(0));
  await browser.click('.cm-content', 0);
  await browser.key({ ...browser.KEYS.enter, modifiers: ['ctrl'] });
  await browser.settle(3);
  const afterEnter = await browser.evaluate(`({ doc: ${readDoc(0)}, mounts: window.__probe.mounts,
    frames: document.querySelectorAll('figure.example [data-stage] iframe').length,
    ownFrames: document.querySelectorAll('figure.example')[0].querySelectorAll('[data-stage] iframe').length,
    srcdoc: (document.querySelector('figure.example [data-stage] iframe') || {}).srcdoc || '' })`);
  check(`${page}: Mod-Enter runs the sketch once`,
    afterEnter.mounts === 1 && afterEnter.ownFrames === 1,
    `${afterEnter.mounts} mount(s) in the figure, ${afterEnter.ownFrames} frame(s) in its stage`);
  check(`${page}: Mod-Enter leaves the source alone`, afterEnter.doc === beforeEnter);

  // The frame's text is the document's, byte for byte.
  const frameCode = /<script[^>]*>\n([\s\S]*)\n<\/script>/.exec(afterEnter.srcdoc);
  check(`${page}: Run hands the editor's bytes to the frame`, Boolean(frameCode) && frameCode[1] === afterEnter.doc,
    frameCode ? `${frameCode[1].length} bytes` : 'no script body in the srcdoc');

  // ── undo and redo ─────────────────────────────────────────────────────────
  await browser.click('.cm-content', 0);
  await browser.type('u');
  await browser.settle();
  const typed = await browser.evaluate(readDoc(0));
  await browser.key({ ...browser.KEYS.z, modifiers: ['ctrl'] });
  await browser.settle();
  const undone = await browser.evaluate(readDoc(0));
  await browser.key({ ...browser.KEYS.y, modifiers: ['ctrl'] });
  await browser.settle();
  const redone = await browser.evaluate(readDoc(0));
  check(`${page}: undo takes the typing back`, undone !== typed && undone === beforeEnter);
  check(`${page}: redo puts it back`, redone === typed);

  // ── Reset, byte for byte, then away from the edit ─────────────────────────
  const original = await browser.evaluate("document.querySelector('textarea.source').defaultValue");
  await browser.click('figure.example [data-reset]');
  await browser.settle();
  const reset = await browser.evaluate(readDoc(0));
  check(`${page}: Reset restores the served source byte for byte`, reset === original,
    `${reset.length} bytes, ${reset === original ? 'identical' : 'DIFFERENT'}`);

  // ── the themes, and a live switch ─────────────────────────────────────────
  await browser.click('.cm-content', 0);
  await browser.key({ ...browser.KEYS.a, modifiers: ['ctrl'] });
  await browser.evaluate("document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.themeChoice = 'light'");
  await browser.settle();
  const light = await browser.evaluate(THEME_STYLES);
  await browser.evaluate("document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.themeChoice = 'dark'");
  await browser.settle();
  const dark = await browser.evaluate(THEME_STYLES);

  const painted = (styles) => styles.token && styles.gutterBg && styles.gutterColor && styles.selection;
  check(`${page}: tokens, caret, gutter and selection are painted in both themes`,
    painted(light) && painted(dark),
    `light ${light.token} / ${light.gutterBg} / ${light.selection}; dark ${dark.token} / ${dark.gutterBg} / ${dark.selection}`);
  check(`${page}: the live switch repaints them`,
    light.token !== dark.token && light.gutterBg !== dark.gutterBg && light.selection !== dark.selection,
    `${light.token} → ${dark.token}`);
  check(`${page}: the switch rebuilds nothing`, light.sameNode && dark.sameNode && light.editors === dark.editors,
    `${light.editors} editor(s) before and after`);
  check(`${page}: the caret follows the page ink`, light.caret === light.pageInk && dark.caret === dark.pageInk,
    `${light.caret} / ${dark.caret}`);
  if (light.comment) {
    check(`${page}: a comment is upright in light and italic in dark, as the site states it`,
      light.comment === 'normal' && dark.comment === 'italic', `${light.comment} / ${dark.comment}`);
  }
  check(`${page}: the editor surface is the site's own, not a second palette`,
    light.gutterBg === light.sidebarBg && light.surface === light.sidebarBg,
    `gutter ${light.gutterBg}, sidebar ${light.sidebarBg}`);

  // The sidebar's search module: the index is fetched on the first keystroke, then filtered.
  await browser.click('.sidebar .search');
  await browser.type('c');
  await browser.type('a');
  await browser.waitFor("document.querySelectorAll('.sidebar .results li a').length > 0",
    `${page}: search results`, 8000);
  const hits = await browser.evaluate("document.querySelectorAll('.sidebar .results li a').length");
  check(`${page}: the search module answers a keystroke`, hits > 0, `${hits} result(s) for "ca"`);
  await browser.key({ ...browser.KEYS.escape });
  await browser.settle();

  // The reader's own path: the theme picker in the rail's foot.
  await browser.click('.side-foot .theme-toggle');
  await browser.click('.side-foot [data-theme-choice="dark"]');
  await browser.settle();
  const picked = await browser.evaluate(THEME_STYLES);
  const picker = await browser.evaluate(`({ theme: document.documentElement.dataset.theme,
    choice: document.documentElement.dataset.themeChoice })`);
  check(`${page}: the theme picker switches the editor, not just the page`,
    picker.theme === 'dark' && picker.choice === 'dark' && picked.token === dark.token,
    `${picker.theme}/${picker.choice}, token ${picked.token}`);
  await browser.click('.side-foot .theme-toggle');
  await browser.click('.side-foot [data-theme-choice="light"]');
  await browser.settle();

  // ── growth and wrapping, on every editor of the page ──────────────────────
  const boxes = await browser.evaluate(`(() => {
    const out = [];
    for (const editor of document.querySelectorAll('.cm-editor')) {
      const scroller = editor.querySelector('.cm-scroller');
      const content = editor.querySelector('.cm-content');
      out.push({
        wrapping: content.classList.contains('cm-lineWrapping'),
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        lines: editor.querySelectorAll('.cm-line').length,
      });
    }
    return out;
  })()`);
  check(`${page}: no editor wraps`, boxes.every((box) => !box.wrapping),
    `${boxes.length} editor(s), ${boxes.filter((b) => b.wrapping).length} wrapping`);
  check(`${page}: every editor grows with its content`,
    boxes.every((box) => box.scrollHeight <= box.clientHeight + 2),
    boxes.map((b) => `${b.scrollHeight}/${b.clientHeight}`).slice(0, 4).join(' '));
  const longestBox = boxes.reduce((a, b) => (b.lines > a.lines ? b : a), boxes[0]);
  check(`${page}: a long line scrolls sideways rather than wrapping`,
    boxes.some((b) => b.scrollWidth > b.clientWidth + 1),
    `widest ${boxes.reduce((n, b) => Math.max(n, b.scrollWidth - b.clientWidth), 0)} px over`);

  // ── the last line of the longest sketch is inside the box ─────────────────
  const clip = await browser.evaluate(`(() => {
    const editors = [...document.querySelectorAll('.cm-editor')];
    const editor = editors.reduce((a, b) => (b.querySelectorAll('.cm-line').length > a.querySelectorAll('.cm-line').length ? b : a), editors[0]);
    editor.scrollIntoView({ block: 'end' });
    const lines = editor.querySelectorAll('.cm-line');
    const last = lines[lines.length - 1];
    const box = editor.getBoundingClientRect();
    const rect = last.getBoundingClientRect();
    return { lines: lines.length, inside: rect.bottom <= box.bottom + 1 && rect.top >= box.top - 1,
             bottom: Math.round(rect.bottom), boxBottom: Math.round(box.bottom) };
  })()`);
  check(`${page}: the longest sketch reaches its last line unclipped`, clip.inside,
    `${clip.lines} line(s), last bottom ${clip.bottom} in a box of ${clip.boxBottom}`);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await browser.navigate(url);
    await browser.waitFor(`document.querySelectorAll('.cm-editor').length === ${sources}`,
      `${page}: editors for the screenshots`, 15000);
    if (SHOT_CSS) {
      const css = readFileSync(SHOT_CSS, 'utf8');
      await browser.evaluate(`(() => {
        const style = document.createElement('style');
        style.dataset.probe = 'stylesheet';
        style.textContent = ${JSON.stringify(css)};
        document.head.append(style);
      })()`);
      await browser.settle();
    }
    await browser.evaluate("document.querySelector('figure.example').scrollIntoView({ block: 'start' })");
    for (const theme of ['light', 'dark']) {
      await browser.evaluate(`document.documentElement.dataset.theme = document.documentElement.dataset.themeChoice = '${theme}'`);
      await browser.settle(4);
      await browser.screenshot(join(SHOTS, `editor-${theme}.png`));
    }
    await browser.evaluate("document.documentElement.dataset.theme = document.documentElement.dataset.themeChoice = 'light'");
  }

  return { mounted, light, dark, clip, longestBox };
}

/** A page whose editor import is delayed: the edit lands before the mount. */
async function delayedPass(browser, base, page) {
  await browser.navigate(`${base}/__slow/${page}`);
  await browser.evaluate("document.querySelector('textarea.source').focus()");
  await browser.evaluate(`(() => { const t = document.querySelector('textarea.source'); t.selectionStart = t.selectionEnd = 0; })()`);
  await browser.type('q');
  const typed = await browser.evaluate("document.querySelector('textarea.source').value");
  await browser.waitFor("document.querySelectorAll('.cm-editor').length >= 1", 'the delayed editor', 20000);
  await browser.waitFor(`document.querySelectorAll('.cm-editor').length === document.querySelectorAll('textarea.source').length`,
    'every delayed editor', 20000);
  const kept = await browser.evaluate(readDoc(0));
  check(`${page}: an edit typed during a delayed import survives the mount`, kept === typed,
    `${kept.length} bytes, starts ${JSON.stringify(kept.slice(0, 8))}`);
  await browser.click('figure.example [data-reset]');
  await browser.settle();
  const after = await browser.evaluate(`({ doc: ${readDoc(0)}, source: document.querySelector('textarea.source').defaultValue })`);
  check(`${page}: Reset still restores the served source after a delayed mount`, after.doc === after.source);
  return { kept, same: after.doc === after.source };
}

/** The editor asset 404s: every textarea stays usable, nothing throws. */
async function fallbackPass(browser, base, page) {
  await browser.navigate(`${base}/__absent/${page}`);
  await browser.settle(6);
  await sleep(400);
  const state = await browser.evaluate(`({
    editors: document.querySelectorAll('.cm-editor').length,
    fallbacks: document.querySelectorAll('figure.example[data-editor="fallback"]').length,
    figures: document.querySelectorAll('figure.example').length,
    visible: [...document.querySelectorAll('textarea.source')].filter((t) => t.getBoundingClientRect().height > 0).length,
    sources: document.querySelectorAll('textarea.source').length,
    errors: window.__probe.errors.slice(),
    requests: performance.getEntriesByType('resource').filter((e) => /assets\\/editor\\./.test(e.name)).map((e) => e.name.split('/').pop()),
  })`);
  check(`${page}: an editor that 404s mounts nothing`, state.editors === 0);
  check(`${page}: every figure is marked fallback`, state.fallbacks === state.figures && state.figures > 0,
    `${state.fallbacks}/${state.figures}`);
  check(`${page}: every textarea is still visible`, state.visible === state.sources, `${state.visible}/${state.sources}`);
  check(`${page}: no unhandled rejection from the failed import`, state.errors.length === 0, state.errors.join(' | '));

  // Run reads the textarea, edited or not; Reset puts the source back.
  await browser.evaluate("document.querySelector('textarea.source').value = 'const broken = 1;'");
  await browser.click('figure.example [data-run]');
  await browser.settle(3);
  const ran = await browser.evaluate(`(() => {
    const f = document.querySelector('figure.example [data-stage] iframe');
    return f ? f.srcdoc.includes('const broken = 1;') : false;
  })()`);
  check(`${page}: Run still runs the textarea, as edited`, ran === true);
  await browser.click('figure.example [data-reset]');
  const reset = await browser.evaluate(`({
    value: document.querySelector('textarea.source').value,
    source: document.querySelector('textarea.source').defaultValue,
  })`);
  check(`${page}: Reset still restores the source with no editor`, reset.value === reset.source);
  return state;
}

async function main() {
  if (!existsSync(site) || !existsSync(join(site, 'assets'))) {
    console.error('[probe] site/ is missing — run `npm run docs` first.');
    process.exit(1);
  }

  console.log('[probe] the built site');
  const stat = staticPass();
  check('every page is stamped with the built editor asset', stat.problems.length === 0,
    `${stat.pages} page(s), ${stat.withExamples} with examples, ${stat.examples} example(s), ${k(stat.bytes)} of source`);
  for (const problem of stat.problems) console.error(`      ${problem}`);
  check('the longest page is named', Boolean(stat.longest.page),
    `${stat.longest.page} — ${stat.longest.examples} example(s), ${k(stat.longest.bytes)}`);

  const server = await serve();
  const browser = await launch();
  let detail = {};
  try {
    const longest = stat.longest.page;
    detail.sweep = await sweepPass(browser, server.url, stat.listed);
    detail.longest = await pagePass(browser, server.url, longest, { detailed: true });
    check(`${longest}: the editor asset arrived over the network`,
      Boolean(detail.longest.mounted.asset.name),
      `${k(detail.longest.mounted.asset.transferSize || detail.longest.mounted.asset.encodedBodySize || 0)} over the wire, ` +
      `${Math.round(detail.longest.mounted.asset.duration || 0)} ms`);
    // Report-only: the budgets are not ruled, so nothing here may turn a slow machine red.
    console.log(`· ${longest}: the editor was ready ${Math.round(detail.longest.mounted.ready || 0)} ms ` +
                'from navigation start (measured, not gated)');

    detail.module = await modulePass(browser, server.url);
    detail.delayed = await delayedPass(browser, server.url, longest);
    detail.fallback = await fallbackPass(browser, server.url, longest);

    // The pages without examples load the runner and ask for no editor at all.
    const without = readdirSync(site).filter((f) => f.endsWith('.html') && !f.startsWith('.')).sort()
      .find((f) => !readFileSync(join(site, f), 'utf8').includes('textarea class="source"'));
    if (without) {
      await browser.navigate(`${server.url}/${without}`);
      await browser.settle(4);
      await sleep(200);
      const state = await browser.evaluate(`({
        editors: document.querySelectorAll('.cm-editor').length,
        requests: performance.getEntriesByType('resource').filter((e) => /assets\\/editor\\./.test(e.name)).length,
        errors: window.__probe.errors.slice(),
      })`);
      check(`${without}: a page with no example asks for no editor`,
        state.editors === 0 && state.requests === 0 && state.errors.length === 0,
        `${state.requests} editor request(s)`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const failed = results.filter((r) => !r.ok);
  const assetName = readdirSync(join(site, 'assets')).find((name) => /^editor\.[0-9a-f]+\.js$/.test(name));
  const assetSize = assetName ? statSync(join(site, 'assets', assetName)).size : 0;
  console.log(`\n[probe] ${results.length - failed.length}/${results.length} check(s) passed`);
  console.log(`[probe] site: ${stat.pages} page(s), ${stat.examples} example(s); longest ${stat.longest.page} ` +
              `(${stat.longest.examples} example(s), ${k(stat.longest.bytes)} of source)`);
  console.log(`[probe] editor: ${assetName} ${k(assetSize)}, ready at ` +
              `${Math.round((detail.longest && detail.longest.mounted.ready) || 0)} ms`);
  if (failed.length) for (const one of failed) console.error(`[probe] ✗ ${one.name}${one.detail ? ` — ${one.detail}` : ''}`);
  if (JSON_OUT) console.log(JSON.stringify({ results, site: stat, detail }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(`[probe] ${error.stack || error}`);
  process.exit(1);
});
