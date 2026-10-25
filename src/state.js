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
 * `state()` clears both sides once, when it makes them: a driver's fresh storage
 * is undefined, and the first pass would otherwise read a history that is not
 * there. After that nothing is cleared but by `reset()` — the pair holds the
 * value, and a clear would zero the data. `reset()` also zeroes the count the
 * blend's weight is made of. A pass that draws *geometry* into the state binds
 * `.write` itself and calls `swap()`; a pass that reads the state while writing
 * elsewhere — a caustics map, a display — reads `.read.color` as a plain
 * texture.
 */

'use strict';

import { state as stateOf } from '@nakednous/idiom';
import { contextOf } from './context.js';

/**
 * A pair of render targets holding one value across frames: `.read` is the side
 * the last pass wrote, `.write` the side the next one writes, and `pass` runs a
 * fullscreen pass from the first into the second and swaps them.
 * @details The caller owns the object — a simulation is held, not re-run per
 * frame — and the pair starts *defined*: `state()` resets it once as it makes it,
 * so the first pass never reads storage the driver has not written. Nothing is
 * cleared after that except by `reset()`: the pair's contents are the data.
 * `pass` restores the framebuffer binding and the viewport it found, so a pass
 * or a reset fired from a panel or a pointer callback cannot leave the frame
 * drawing into the state.
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
  return stateOf(contextOf(gl), opts);
}
