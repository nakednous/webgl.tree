/**
 * @file The density gate — every documented example run at two densities.
 * @module webgl.tree/tools/density
 * @license AGPL-3.0-only
 *
 * `npm run density` mounts each example of the API site — every doclet's
 * examples and the index page's ES-modules demo — in headless Chromium twice,
 * at a device scale factor of 1 and of 2, and fails when a figure's drawing
 * does not follow the drawing buffer. It is the gate for the class of defect
 * that a review at density 1 cannot see: a rect authored in page pixels drawn
 * into a buffer the display's density has scaled, which lands in a corner at
 * 1/density; and a canvas that never took the display's density at all, whose
 * every edge the compositor then stretches.
 *
 * The rules, and what they cost.
 *   - Canvas: every canvas the document holds a WebGL2 context on must be
 *     `page size × density` — what createCanvas makes. A hand-rolled
 *     `canvas.width = 400` is half its page at density 2 and fails here.
 *   - Rects: `image()`'s rect and every `gl.viewport` on the default
 *     framebuffer must move when the buffer does. A rect whose numbers are the
 *     same at both densities was authored from constants — page pixels — and
 *     fails here, rect by rect, so a figure that places a target-sized panel at
 *     a buffer-derived corner reports the panel and not the corner. A target's
 *     own pixels are its own, so rects recorded while a framebuffer was bound
 *     are never judged.
 *
 * An example whose page threw, timed out or drew no canvas is reported and not
 * judged: the gate is about the crossing, not about an example's assets or the
 * pointer. Comparisons are on the sets of recorded rects, so an animated figure
 * costs nothing. `DENSITY_ONLY=<text>` mounts the examples whose owner and name
 * carry it and `DENSITY_LIMIT=<n>` the first n — a maintainer fixing one figure
 * runs that figure. One browser serves each pass; the page's own report is read
 * with the examples' text verbatim, the build beside it, and the site's assets
 * served from `site/` — so `npm run docs` comes first.
 *
 * Limits, stated: the gate sees the rects the bridge is handed, not the
 * pixels that result, so a rect that moves with the buffer but is wrong by a
 * factor still passes; and a figure that reaches SCREEN through a call the
 * bridge makes internally (pipe's display) records no rect. Both are the price
 * of a check that runs without a GPU or a pair of eyes.
 */

'use strict';

import { createReadStream, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSources } from '../docs/parser.js';
import { page, SHIM } from './page.js';
import { browserAt } from './driver.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at = (p) => join(root, p);
const site = at('site');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.obj': 'text/plain',
  '.hdr': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.wgsl': 'text/plain',
};

/** The examples to mount: every doclet's, then the index page's module demo. */
function examples() {
  const list = [];
  for (const d of parseSources(at('src'), at('docs')).doclets) {
    d.examples.forEach((ex, i) => {
      list.push({
        name: `${d.name} #${i + 1}`,
        owner: d.owner ? `${d.owner}/${d.name}` : d.name,
        caption: ex.caption || '',
        code: ex.code,
        mode: 'classic',
      });
    });
  }
  const md = readFileSync(at('tools/docs/esm.md'), 'utf8');
  const demo = /```js\n([\s\S]*?)```/.exec(md);
  if (demo) list.push({ name: 'es-modules #1', owner: 'the index page', caption: 'the ES modules demo', code: demo[1], mode: 'module' });
  return list;
}

/** The build and the peer, written beside the pages so a page's relative URLs resolve as on the site. */
function assets() {
  const pairs = [
    ['.density-twgl.js', 'node_modules/twgl.js/dist/7.x/twgl-full.js'],
    ['.density-twgl.module.js', 'node_modules/twgl.js/dist/7.x/twgl-full.module.js'],
    ['.density-lib.js', 'dist/webgl.tree.js'],
    ['.density-esm.js', 'dist/index.js'],
    ['.density-tree.js', 'node_modules/@nakednous/tree/dist/index.js'],
    ['.density-host.js', 'node_modules/@nakednous/host/dist/index.js'],
    ['.density-idiom.js', 'node_modules/@nakednous/idiom/dist/index.js'],
  ];
  for (const [to, from] of pairs) copyFileSync(at(from), join(site, to));
  writeFileSync(join(site, '.density-shim.js'), SHIM);
  return ['-twgl', '-lib', '-esm', '-tree', '-host', '-idiom'].map((s) => join(site, `.density${s}.js`))
    .concat(join(site, '.density-twgl.module.js'), join(site, '.density-shim.js'));
}

/** Serve `site/` — the pages' `models/torus.obj` and the rest resolve as they do on the site. */
function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = normalize(join(site, url === '/' ? '/index.html' : url));
    if (!file.startsWith(site) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)),
  })));
}

/** One example's verdict under the two rules: `{ judged }`, `{ faults }` or `{ skipped }`. */
function judge(name, one, two) {
  if (one.failed || two.failed) return { name, skipped: one.failed || two.failed };
  const r1 = one.report, r2 = two.report;
  if (r1.error || r2.error) return { name, skipped: r1.error || r2.error };
  if (!r1.canvases.length || !r2.canvases.length) return { name, skipped: 'no canvas' };
  const faults = [];
  // a canvas at the display's density: buffer = page size × density
  for (const [pass, r] of [[1, r1], [2, r2]]) {
    for (const c of r.canvases) {
      if (c.client[0] > 0 && c.client[1] > 0 &&
          (Math.abs(c.buffer[0] - c.client[0] * r.dpr) > 1 || Math.abs(c.buffer[1] - c.client[1] * r.dpr) > 1)) {
        faults.push(`at density ${pass}: a canvas of ${c.buffer[0]}×${c.buffer[1]} ` +
                    `over ${c.client[0]}×${c.client[1]} page px`);
      }
    }
  }
  // a rect that follows the buffer: no rect may keep its numbers across the densities
  const a = [...new Set(r1.rects)].sort(), b = [...new Set(r2.rects)];
  const stuck = a.filter((r) => b.includes(r));
  if (stuck.length) faults.push(`rect(s) unchanged at density 2: ${stuck.join(' · ')}`);
  return faults.length ? { name, faults } : { judged: true };
}

async function main() {
  if (!existsSync(join(site, 'models'))) {
    console.error('[density] site/ is missing its assets — run `npm run docs` first.');
    process.exit(1);
  }
  const list = examples();
  const limit = Number(process.env.DENSITY_LIMIT || 0);
  const only = process.env.DENSITY_ONLY || '';
  const picked = only ? list.filter((ex) => `${ex.owner} ${ex.name}`.toLowerCase().includes(only.toLowerCase())) : list;
  const mounted = limit > 0 ? picked.slice(0, limit) : picked;
  if (!mounted.length) { console.error(`[density] no example matches "${only}".`); process.exit(1); }
  const written = [];
  const cleanup = [];
  let server = null;
  try {
    cleanup.push(...assets());
    for (const [i, ex] of mounted.entries()) {
      const file = `.density-${i}.html`;
      writeFileSync(join(site, file), page({
        title: `${ex.owner} · ${ex.name}`,
        code: ex.code,
        mode: ex.mode,
        twgl: '.density-twgl.js',
        lib: '.density-lib.js',
        imports: {
          'twgl.js': './.density-twgl.module.js',
          'webgl.tree': './.density-shim.js',
          '@nakednous/tree': './.density-tree.js',
          '@nakednous/host': './.density-host.js',
          '@nakednous/idiom': './.density-idiom.js',
        },
      }));
      written.push(join(site, file));
      ex.page = file;
    }
    server = await serve();
    const passes = {};
    for (const d of [1, 2]) {
      const browser = await browserAt(d);
      try {
        passes[d] = [];
        for (const ex of mounted) {
          passes[d].push(await browser.load(`${server.url}/${ex.page}`));
        }
      } finally {
        await browser.close();
      }
    }
    if (process.env.DENSITY_VERBOSE) {
      mounted.forEach((ex, i) => {
        const one = passes[1][i], two = passes[2][i];
        const line = (r) => r.failed ? r.failed : JSON.stringify({
          dpr: r.report.dpr, canvases: r.report.canvases.map((c) => `${c.buffer.join('x')}/${c.client.join('x')}`),
          rects: r.report.rects,
        });
        console.log(`[density] ${ex.owner} · ${ex.name}\n          1: ${line(one)}\n          2: ${line(two)}`);
      });
    }
    const verdicts = mounted.map((ex, i) => judge(`${ex.owner} · ${ex.name}`, passes[1][i], passes[2][i]));
    const faults = verdicts.filter((v) => v.faults);
    const skipped = verdicts.filter((v) => v.skipped);
    for (const v of faults) console.error(`[density] ✗ ${v.name}\n             ${v.faults.join('\n             ')}`);
    for (const v of skipped.slice(0, 10)) console.warn(`[density] – ${v.name}: ${v.skipped}`);
    if (skipped.length > 10) console.warn(`[density] – … and ${skipped.length - 10} more not judged`);
    const judged = verdicts.length - skipped.length;
    console.log(`[density] ${mounted.length} example(s) · ${judged} judged · ${skipped.length} not judged · ` +
                `${faults.length} fault(s)`);
    if (faults.length) process.exitCode = 1;
    if (!judged) {
      console.error('[density] no example could be judged: a browser without WebGL2 proves nothing.');
      process.exitCode = 1;
    }
  } finally {
    if (server) await server.close();
    for (const f of written.concat(cleanup)) { try { rmSync(f, { force: true }); } catch (_) { /* gone already */ } }
  }
}

main().catch((e) => { console.error(`[density] ${e.stack || e}`); process.exit(1); });
