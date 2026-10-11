/**
 * @file State — state(gl, opts): a target pair holding one value across frames.
 * @module webgl.tree/state
 * @license AGPL-3.0-only
 *
 * `pipe` is a pure function of its source: an image chain, each working target
 * cleared before its pass, the pair alternated inside the call. A state is not
 * that — the pair's contents *are* the data. `state(gl, opts)` owns two render
 * targets, hands out the side the last pass wrote and the side the next one
 * writes, and runs a fullscreen pass from one into the other:
 *
 * ```
 * const mean = state(gl, { width: 256, height: 192, format: gl.FLOAT })
 * mean.pass(accum, { uWeight: 1 / (mean.count + 1) })   // read → write, then swap
 * image(gl, mean.read.color)                            // the value, shown
 * ```
 *
 * Nothing is ever cleared: the pair holds the value, and a clear would zero the
 * data. `reset()` is the one call that clears — and the one that zeroes the
 * count the blend's weight is made of. A pass that draws *geometry* into the
 * state binds `.write` itself and calls `swap()`; a pass that reads the state
 * while writing elsewhere — a caustics map, a display — reads `.read.color` as a
 * plain texture.
 */

'use strict';

import { bindFramebufferInfo } from 'twgl.js';
import { renderTarget } from './target.js';
import { filter } from './pass.js';

const _vp = [0, 0, 0, 0];
const _clear = [0, 0, 0, 0];

const _viewport = (gl) => {
  const v = gl.getParameter(gl.VIEWPORT);
  _vp[0] = v[0]; _vp[1] = v[1]; _vp[2] = v[2]; _vp[3] = v[3];
  return _vp;
};

/**
 * A pair of render targets holding one value across frames: `.read` is the side
 * the last pass wrote, `.write` the side the next one writes, and `pass` runs a
 * fullscreen pass from the first into the second and swaps them.
 * @details The caller owns the object — a simulation is held, not re-run per
 * frame — and nothing is cleared except by `reset()`: the pair's contents are
 * the data. `pass` restores the framebuffer binding and the viewport it found,
 * so a pass or a reset fired from a panel or a pointer callback cannot leave the
 * frame drawing into the state.
 * @param {WebGL2RenderingContext} gl
 * @param {{ width?:number, height?:number, format?:number, float?:boolean,
 *           minMag?:number, wrap?:number, clear?:number[] }} [opts]
 *        `renderTarget`'s sampling and format options, and only those: one
 *        colour texture per side, no depth, no multisampling. `clear` is the
 *        colour `reset()` clears both sides to (default transparent black).
 * @returns {object} The state: `read` · `write` · `count` — read-only, because
 *        a pair and a counter that can be assigned apart are the drift this verb
 *        exists to prevent — and `pass(prog, uniforms)` · `swap()` · `reset()` ·
 *        `resize(w, h)` · `dispose()`.
 * @example
 * <caption>A value across frames: each pass folds a jittered sample into the mean its read side carries, so the frames converge as the count grows.</caption>
 * const { createCanvas, image, program, state } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const accum = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uScene;   // the mean so far — the state's read side
 * uniform float uWeight;      // 1 / (n + 1): the sample's own weight
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   vec3 estimate = mix(vec3(0.09, 0.11, 0.16), vec3(0.94, 0.76, 0.31),
 *                       step(0.5, fract(vTexCoord.x * 40.0)));
 *   outColor = vec4(mix(texture(uScene, vTexCoord).rgb, estimate, uWeight), 1.0);
 * }`)
 *
 * // float, not 8-bit: the increment shrinks with the count and an 8-bit target
 * // would quantize it away; NEAREST, because the state is read at its own texel
 * const mean = state(gl, { width: 256, height: 192, format: gl.FLOAT, minMag: gl.NEAREST })
 *
 * for (let n = 0; n < 8; n++) mean.pass(accum, { uWeight: 1 / (mean.count + 1) })
 * image(gl, mean.read.color)
 */
export function state(gl, opts) {
  const o = opts || {};
  const clear = o.clear || _clear;
  // one colour texture per side: renderTarget's sampling and format options only
  const spec = { width: o.width, height: o.height, format: o.format, float: o.float, minMag: o.minMag, wrap: o.wrap };
  const A = renderTarget(gl, spec);
  const B = renderTarget(gl, spec);

  let read = A, write = B, count = 0;

  const pair = {
    /**
     * Run a fullscreen pass from the read side into the write side, then swap.
     * @param {object} prog  A pass program from program(gl, frag).
     * @param {object} [uniforms]  The pass's bag, by name.
     * @returns {object} The state.
     */
    pass(prog, uniforms) {
      const outer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      _viewport(gl);
      bindFramebufferInfo(gl, write);                 // twgl's verb: it sets the viewport too
      filter(gl, prog, uniforms, read.color);         // the input is the read side, by declaration
      const t = read; read = write; write = t;
      count += 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, outer);
      gl.viewport(_vp[0], _vp[1], _vp[2], _vp[3]);
      return pair;
    },
    /**
     * Exchange the two sides on your own terms — what a pass that draws geometry
     * into the state calls after binding `.write` itself. The count is a pass's,
     * so this leaves it alone.
     * @returns {object} The state.
     */
    swap() {
      const t = read; read = write; write = t;
      return pair;
    },
    /**
     * Clear both sides to the state's own colour and zero the count: a defined
     * start, for a target pair whose contents the API leaves undefined. The
     * context's clear colour and its bound target are its own again afterwards.
     * @returns {object} The state.
     */
    reset() {
      const outer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const prior = gl.getParameter(gl.COLOR_CLEAR_VALUE);
      _viewport(gl);
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      for (const t of [A, B]) { bindFramebufferInfo(gl, t); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.clearColor(prior[0], prior[1], prior[2], prior[3]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outer);
      gl.viewport(_vp[0], _vp[1], _vp[2], _vp[3]);
      count = 0;
      return pair;
    },
    /**
     * Resize both sides and zero the count — the frames a mean was taken of were
     * taken at another size. The API zeroes the reallocated storage, so the pair
     * starts blank.
     * @param {number} width
     * @param {number} height
     * @returns {object} The state.
     */
    resize(width, height) {
      A.resize(width, height);
      B.resize(width, height);
      count = 0;
      return pair;
    },
    /**
     * Delete both sides' attachments and framebuffers.
     * @returns {object} The state.
     */
    dispose() {
      A.dispose();
      B.dispose();
      return pair;
    },
  };

  // read, write and count are the verb's: the swap is pass's, and a count that
  // could be assigned beside the pair is exactly the drift this verb prevents
  Object.defineProperties(pair, {
    read: { get: () => read, enumerable: true },
    write: { get: () => write, enumerable: true },
    count: { get: () => count, enumerable: true },
  });
  return pair;
}
