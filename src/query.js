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
 *
 * The calls beneath it are the ES 3.0 ones: a query object per question,
 * glBeginQuery/glEndQuery around the bound's own draw, and glGetQueryObjectuiv
 * polled until QUERY_RESULT_AVAILABLE — [glBeginQuery][bg] (its page carries
 * glEndQuery), [glGenQueries][gq], [glGetQueryObjectuiv][gqq] · and the API
 * surface as WebGL 2 exposes it: [createQuery][cq] · [beginQuery][bq] ·
 * [endQuery][eq] · [getQueryParameter][gqp]. ANY_SAMPLES_PASSED_CONSERVATIVE is
 * core in ES 3.0; WebGL 2 forbids making a result available in the frame that
 * asked, which is what `latency` reports rather than assumes.
 *
 * [bg]: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glBeginQuery.xhtml
 * [gq]: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glGenQueries.xhtml
 * [gqq]: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glGetQueryObjectuiv.xhtml
 * [cq]: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/createQuery
 * [bq]: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/beginQuery
 * [eq]: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/endQuery
 * [gqp]: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/getQueryParameter
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
 * <caption>A cube slides behind a wall; the verdict is asked against the wall's depth, and the cube draws on the frame before's answer.</caption>
 * const { createCanvas, bind, buffer, draw, query, setCamera, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * uniform mat4 uModelViewProjectionMatrix;
 * void main() { gl_Position = uModelViewProjectionMatrix * aPosition; }`, `#version 300 es
 * precision highp float;
 * uniform vec3 uColor;
 * out vec4 outColor;
 * void main() { outColor = vec4(uColor, 1.0); }`])
 * const unit = buffer(gl, twgl.primitives.createCubeVertices(1))     // one unit cube, scaled by each matrix
 * const cam = tree.createCamera({ eye: [0, 120, 420] })
 * const wall = tree.mat4FromTRS(tree.mat4(), 0, 0, -260, 0, 0, 0, 1, 220, 160, 4)
 * const M = tree.mat4()
 * const verdict = query(gl, { pool: 4 })
 *
 * function frame(ms) {
 *   tree.mat4FromTRS(M, 0, 0, -260 + 180 * Math.cos(ms / 1400), 0, 0, 0, 1, 55, 55, 55)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   bind(gl, prog, { uColor: [0.5, 0.55, 0.6] })
 *   draw(gl, unit, wall)                                           // the occluder, before the question
 *   bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 *   gl.colorMask(false, false, false, false)                       // ask without painting,
 *   gl.depthMask(false)                                            // or leaving a mark in depth
 *   verdict.ask(() => draw(gl, unit, M))                           // this frame's question
 *   gl.colorMask(true, true, true, true)
 *   gl.depthMask(true)
 *   if (verdict.value) draw(gl, unit, M)                           // the answer an earlier frame left
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
