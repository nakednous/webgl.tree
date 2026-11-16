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
 * <caption>A value across frames: one pass a frame, each folding a jittered sample into the mean its read side carries — the image converges as the count grows.</caption>
 * const { createCanvas, image, program, state } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const accum = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uScene;   // the mean so far — the state's read side
 * uniform vec2 uJitter;       // this frame's sample position inside the pixel
 * uniform float uWeight;      // 1 / (n + 1): the sample's own weight
 * uniform vec2 uPixel;        // one figure pixel, in uv
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   vec2 at = (floor(gl_FragCoord.xy) + uJitter) * uPixel;
 *   vec2 q = vec2(at.x * 1.5, at.y) - vec2(0.75, 0.5);   // a disc, aspect-corrected
 *   float r = length(q);
 *   float figure = step(r, 0.3) * step(0.5, fract(r * r * 900.0));   // a zone plate
 *   vec3 estimate = mix(vec3(0.10, 0.12, 0.17), vec3(0.93, 0.76, 0.31), figure);
 *   outColor = vec4(mix(texture(uScene, vTexCoord).rgb, estimate, uWeight), 1.0);
 * }`)
 *
 * // float, not 8-bit: the increment shrinks with the count and an 8-bit target
 * // would quantize it away; LINEAR, because the display scales the state up to
 * // a denser drawing buffer
 * const mean = state(gl, { width: 400, height: 300, format: gl.FLOAT, minMag: gl.LINEAR })
 *
 * const R2 = [0.7548776662466927, 0.5698402909980532]   // one offset a frame
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:#d8dee9;font:13px ui-monospace,monospace'
 * const reset = document.body.appendChild(document.createElement('button'))
 * reset.textContent = 'reset'
 * reset.style.cssText = 'position:absolute;right:8px;top:8px'
 * reset.onclick = () => mean.reset()
 *
 * function frame() {
 *   const n = mean.count
 *   mean.pass(accum, {
 *     uJitter: [(n * R2[0]) % 1, (n * R2[1]) % 1],
 *     uWeight: 1 / (n + 1),
 *     uPixel: [1 / mean.read.width, 1 / mean.read.height],
 *   })
 *   image(gl, mean.read.color)
 *   out.textContent = 'n = ' + n
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function state(gl, opts) {
  return stateOf(contextOf(gl), opts);
}
