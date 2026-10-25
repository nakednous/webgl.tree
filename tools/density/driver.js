/**
 * @file The density gate's browser: a headless Chromium over CDP, no dependencies.
 * @module webgl.tree/tools/density/driver
 * @license AGPL-3.0-only
 *
 * `browserAt(density)` launches Chromium with a forced device scale factor and
 * returns `load(url)` — the page's own density report, read a few frames after
 * its load event — and `close()`. One browser serves a whole pass.
 *
 * @details
 * CDP is spoken over Node's global WebSocket; the browser's debugging port is
 * asked for (0) and read back from `DevToolsActivePort`, so two passes never
 * fight over a port. The binary is `CHROME_BIN` when set, else the first of
 * chromium, chromium-browser, google-chrome, google-chrome-stable, chrome that
 * answers `--version`. The profile lives in a temporary directory and goes with
 * the browser, and extensions are off: a fresh profile is not enough, because
 * `plasma-browser-integration` ships a system-wide external-extension manifest
 * (`/usr/share/chromium/extensions/`) that every profile installs, and its
 * native host aborts in a sandbox with no display. `load` waits on
 * `window.__density.done`, which the page sets two
 * frames after load; a page that never gets there is reported, not thrown.
 * `--enable-unsafe-swiftshader` is stated so a machine without a GPU — a CI
 * runner — renders WebGL2 in software instead of refusing the context; the gate
 * then judges on the software rasterizer's pixels-free evidence: the rects.
 */

'use strict';

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The browser's path: `CHROME_BIN`, or the first candidate that answers. */
function findChrome() {
  const env = process.env.CHROME_BIN;
  if (env) return env;
  for (const bin of CANDIDATES) {
    const r = spawnSync(bin, ['--version'], { stdio: 'ignore' });
    if (!r.error && r.status === 0) return bin;
  }
  return null;
}

/**
 * A headless browser at one device scale factor.
 * @param {number} density  The device scale factor, 1 or 2.
 * @returns {Promise<{ load:function(string, number=4000):Promise<object>, close:function():Promise<void> }>}
 * @ignore
 */
export async function browserAt(density) {
  const bin = findChrome();
  if (!bin) throw new Error('[density] no Chromium found — set CHROME_BIN to one.');
  const profile = mkdtempSync(join(tmpdir(), 'webgl-tree-density-'));
  const proc = spawn(bin, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${density}`, '--window-size=1000,760',
    '--hide-scrollbars', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  // the port and the browser's own WebSocket path, once it is up
  const file = join(profile, 'DevToolsActivePort');
  let lines = null;
  for (let i = 0; i < 200 && !lines; i++) {
    await sleep(50);
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8').split('\n');
      if (text[0] && text[1]) lines = text;
    }
  }
  if (!lines) { proc.kill(); throw new Error('[density] Chromium did not open its debugging port.'); }

  const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('[density] the CDP socket refused.')); });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const at = (method, params) => send(method, params, sessionId);
  await at('Page.enable');
  await at('Runtime.enable');

  /**
   * Load one page and read its density report; `{ failed }` when it did not
   * arrive, `{ report }` otherwise.
   */
  async function load(url, wait = 4000) {
    try {
      await at('Page.navigate', { url });
      const deadline = Date.now() + wait;
      while (Date.now() < deadline) {
        await sleep(80);
        const r = await at('Runtime.evaluate', {
          expression: 'Boolean(window.__density && window.__density.done)', returnByValue: true,
        });
        if (r.result && r.result.value === true) break;
      }
      const r = await at('Runtime.evaluate', {
        expression: `JSON.stringify({
          dpr: window.devicePixelRatio,
          rects: (window.__density && window.__density.rects) || [],
          error: (window.__density && window.__density.error) || null,
          canvases: Array.from(document.querySelectorAll('canvas')).map((c) => {
            let gl = null;
            try { gl = c.getContext('webgl2'); } catch (_) { /* a 2D canvas has no WebGL2 context */ }
            return gl ? { buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], client: [c.clientWidth, c.clientHeight] } : null;
          }).filter(Boolean),
        })`,
        returnByValue: true,
      });
      const value = r.result && r.result.value;
      return value ? { report: JSON.parse(value) } : { failed: 'no report' };
    } catch (e) {
      return { failed: e.message };
    }
  }

  async function close() {
    try { ws.close(); } catch (_) { /* already gone */ }
    proc.kill();
    await sleep(100);
    try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* a busy profile is the OS's */ }
  }

  return { load, close };
}
