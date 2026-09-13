/**
 * @file The per-context registry — one entry per WebGL2 context, keyed by gl.
 * @module twgl.tree/context
 * @license AGPL-3.0-only
 *
 * Every bridge call takes gl first and finds its state here: the installed
 * camera (V, P, PV and the per-draw scratch), the view bag a host-less
 * application reads, the bound program, the cached fullscreen geometry, the
 * internal programs, the pipe caches and the targets to release. The entry is
 * created lazily on first use and released by dispose(gl).
 *
 *   init(gl, { host, ndcZMin })   // optional: pre-create the entry, attach a host
 *   dispose(gl)                   // release every GPU resource the bridge made here
 *
 * A host attached at init (or passed per call as { host }) is where setCamera
 * writes the view bag and where gizmo label anchors go. Without one the
 * bridge keeps its own view bag, reachable through viewOf(gl).
 */

'use strict';

import { WEBGL } from '@nakednous/tree';
import { createView } from '@nakednous/host';

const _registry = new WeakMap();

const _identity = (m) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };

/**
 * Pre-create a context's entry, attaching a host and overriding defaults.
 * @param {WebGL2RenderingContext} gl
 * @param {{ host?:object, ndcZMin?:number }} [opts]
 *        host: the @nakednous/host context of the canvas. ndcZMin: WEBGL
 *        (−1, the default and the only value a WebGL2 context needs).
 * @returns {object} The entry.
 */
export function init(gl, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  if (o.host !== undefined) ctx.host = o.host || null;
  if (o.ndcZMin != null) { ctx.ndcZMin = o.ndcZMin; ctx.view.ndcZMin = o.ndcZMin; }
  return ctx;
}

/**
 * The entry of a context, created on first use.
 * @param {WebGL2RenderingContext} gl
 * @returns {object}
 */
export function contextOf(gl) {
  let ctx = _registry.get(gl);
  if (ctx) return ctx;
  ctx = {
    gl,
    host: null,
    ndcZMin: WEBGL,
    V: _identity(new Float32Array(16)),
    P: _identity(new Float32Array(16)),
    PV: _identity(new Float32Array(16)),
    MV: new Float32Array(16),          // per-draw scratch
    MVP: new Float32Array(16),
    N: new Float32Array(9),
    view: createView({ ndcZMin: WEBGL }),   // the host-less view bag
    prog: null,                        // the program bind() installed
    declared: new WeakMap(),           // programInfo → which transforms it declares
    programs: {},                      // the internal programs, compiled lazily
    quad: null,                        // the fullscreen geometry
    sizes: new WeakMap(),              // texture → [width, height], for uTexelSize
    pipes: {},                         // key → { ping, pong }
    targets: new Set(),                // every renderTarget made here
    gizmos: {},                        // name → { arrays, buffer, capacity, wide }, the line pipe's caches
    rigs: new WeakMap(),               // helm → { fbo, size }, the rig HUD overload's targets
    hud: null,                         // the camera saved by beginHUD, while active
  };
  _registry.set(gl, ctx);
  return ctx;
}

/**
 * The view bag of a context: the host's when one is attached, else the
 * bridge's own, filled by setCamera — the matrices bag mapLocation takes.
 * @param {WebGL2RenderingContext} gl
 * @returns {object}
 */
export function viewOf(gl) {
  const ctx = contextOf(gl);
  return ctx.host ? ctx.host.view : ctx.view;
}

/**
 * Release every GPU resource the bridge created for a context — targets,
 * the pipe caches, the internal programs, the fullscreen geometry — and
 * forget the entry. The application's own programs and buffers are untouched.
 * @param {WebGL2RenderingContext} gl
 */
export function dispose(gl) {
  const ctx = _registry.get(gl);
  if (!ctx) return;
  for (const t of [...ctx.targets]) { if (typeof t.dispose === 'function') t.dispose(); }
  ctx.targets.clear();
  ctx.pipes = {};
  for (const k of Object.keys(ctx.programs)) {
    const p = ctx.programs[k];
    if (p && p.program && typeof gl.deleteProgram === 'function') gl.deleteProgram(p.program);
  }
  ctx.programs = {};
  for (const g of Object.values(ctx.gizmos)) {
    if (g.buffer && typeof gl.deleteBuffer === 'function') for (const a of Object.values(g.buffer.attribs)) gl.deleteBuffer(a.buffer);
  }
  ctx.gizmos = {};
  if (ctx.quad) {
    for (const a of Object.values(ctx.quad.attribs || {})) { if (a.buffer && typeof gl.deleteBuffer === 'function') gl.deleteBuffer(a.buffer); }
    if (ctx.quad.indices && typeof gl.deleteBuffer === 'function') gl.deleteBuffer(ctx.quad.indices);
    ctx.quad = null;
  }
  _registry.delete(gl);
}
