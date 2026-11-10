/**
 * @file Occlusion queries — the delayed verdict the notation spells `query`.
 * @module webgl.tree/query
 * @license AGPL-3.0-only
 *
 * `query` asks the GPU whether any sample of a bound survives the depth test. The
 * answer does not come back with the question: it lands a frame or more later, and
 * until it does the slot reads the verdict before it — the honesty the technique
 * is built on, and the reason a bound can be skipped for a frame it should not
 * have been.
 *
 * ```
 * query(gl, { pool }) → { ask(draw, { conservative }), value, latency, pending, dispose }
 * ```
 *
 * @details
 * One query is active per target at a time, so a frame's worth of questions needs
 * a frame's worth of query objects; the slot keeps that ring, asks from the free
 * end, and collects whatever has landed before asking again. It paints nothing
 * itself: the caller turns the colour and depth writes off around `ask`, which is
 * the technique's only mark on the pipeline — no shader is authored and no uniform
 * is bound, so the bound draws through the material it always had.
 *
 * The verdict is conservative by default: `value` reads `true` until one lands, so
 * a caller that draws on it never drops a visible bound on the strength of a
 * question that has not been answered yet.
 */

'use strict';

import { contextOf } from './context.js';

/**
 * One bound's verdict slot, asked once a frame and read a frame or more later.
 * @param {WebGL2RenderingContext} gl
 * @param {{ pool?:number }} [opts]
 *        pool: how many questions may be in flight at once, default 8 — one per
 *        frame of latency the ring is expected to cover.
 * @returns {{ ask:function(function():void, object=):boolean, value:boolean, latency:number,
 *             pending:number, dispose:function():void }}
 *          ask(draw, opts): issue this frame's question around `draw` — which must
 *          draw only the bound, so the query measures it and nothing else — and
 *          report whether it was issued; a full pool skips the frame's question.
 *          `opts.conservative` asks ANY_SAMPLES_PASSED_CONSERVATIVE, which reports
 *          hidden only when no sample of the bound can pass. value: the last
 *          verdict that landed, `true` until one does. latency: how many asks the
 *          last verdict took to land. pending: how many are in flight.
 * @example
 * <caption>Ask once a frame whether the bound is hidden; draw on the answer an earlier frame left.</caption>
 * const { createCanvas, query, setCamera, axes, tree } = webglTree
 *
 * const gl = createCanvas(320, 200)
 * const cam = tree.createCamera({ eye: [200, 160, 260] })
 * const verdict = query(gl, { pool: 4 })
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   if (verdict.value) axes(gl, { size: 100 })           // an earlier frame's answer
 *   gl.colorMask(false, false, false, false)             // ask without painting,
 *   gl.depthMask(false)                                  // or leaving a mark in depth
 *   verdict.ask(() => axes(gl, { size: 100 }), { conservative: true })
 *   gl.colorMask(true, true, true, true)
 *   gl.depthMask(true)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function query(gl, opts) {
  const o = opts || {};
  const ctx = contextOf(gl);
  const pool = Math.max(1, Math.floor(typeof o.pool === 'number' ? o.pool : 8));
  const live = [];                       // issued, not yet landed: { q, issued }
  const free = [];                       // spent objects, reused in place
  let value = true;                      // the conservative default
  let latency = 0;                       // asks the last verdict took
  let asks = 0;                          // questions issued since the slot was made
  let dead = false;

  /** Collect every verdict that has landed; a slot's answer replaces the last. */
  function collect() {
    for (let i = 0; i < live.length;) {
      const e = live[i];
      if (gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) {
        value = !!gl.getQueryParameter(e.q, gl.QUERY_RESULT);
        latency = asks - e.issued;
        free.push(e.q);
        live.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  const slot = {
    ask(draw, askOpts) {
      if (dead) return false;
      asks++;                                           // this frame starts here
      collect();                                        // its reading, before the next question
      if (live.length >= pool) return false;            // the ring is full: no question this frame
      const q = free.pop() || gl.createQuery();
      const conservative = !!(askOpts && askOpts.conservative);
      const target = conservative ? gl.ANY_SAMPLES_PASSED_CONSERVATIVE : gl.ANY_SAMPLES_PASSED;
      gl.beginQuery(target, q);
      draw();
      gl.endQuery(target);
      live.push({ q, issued: asks });
      return true;
    },

    get value() { return value; },
    get latency() { return latency; },
    get pending() { return live.length; },

    dispose() {
      if (dead) return;
      dead = true;
      for (const e of live) gl.deleteQuery(e.q);
      for (const q of free) gl.deleteQuery(q);
      live.length = 0;
      free.length = 0;
    },
  };
  if (!ctx.queries) ctx.queries = new Set();
  ctx.queries.add(slot);
  return slot;
}
