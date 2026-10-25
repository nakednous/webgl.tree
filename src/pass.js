/**
 * @file Passes — program(frag), fullscreen, filter, image, pipe.
 * @module webgl.tree/pass
 * @license AGPL-3.0-only
 *
 * Fullscreen passes: `program` compiles a fragment shader, `filter` runs it
 * over the current target, `image` draws a texture, and `pipe` chains passes
 * through two cached targets.
 *
 * ```
 * program(gl, frag)                  // a pass program; vTexCoord in, the input by declaration
 * filter(gl, prog, uniforms, input)  // run one pass
 * image(gl, tex, opts)               // { x, y, width, height, tint, mask, blend }
 * pipe(gl, source, passes, opts)     // the chain; releasePipe(gl) frees its targets
 * ```
 *
 * @details
 * The pass-through vertex stage is fixed in NDC; the covering geometry's
 * aTexCoord is bottom-up. filter fills uResolution (the current viewport) and
 * uTexelSize ([1 / w, 1 / h] of the input) only when the program declares them,
 * and binds `input` to every sampler the program declares and the bag leaves
 * unset — so a stage names its own input (uSource, uScene, its own word) and a
 * stage that reads no texture is handed none. image goes
 * through the internal flat program with a rect in target pixels, origin
 * bottom-left, default cover; no flip option anywhere — orientation is
 * settled at upload.
 */

'use strict';

import {
  program as programOf, fullscreen as fullscreenOf, filter as filterOf,
  image as imageOf, pipe as pipeOf, releasePipe as releasePipeOf,
} from '@nakednous/idiom';
import { contextOf } from './context.js';

/** `image`'s `mask` for the red channel alone. */
export const RED = [true, false, false, false];
/** `image`'s `mask` for the green channel alone. */
export const GREEN = [false, true, false, false];
/** `image`'s `mask` for the blue channel alone. */
export const BLUE = [false, false, true, false];
/** `image`'s `mask` for the alpha channel alone. */
export const ALPHA = [false, false, false, true];
/** `image`'s `mask` for colour without alpha. */
export const RGB = [true, true, true, false];

/** `image`'s `blend`: src alpha over one-minus-src alpha. */
export const NORMAL = 'NORMAL';
/** `image`'s `blend`: one over one, additive. */
export const ADD = 'ADD';
/** `image`'s `blend`: dst colour over zero, multiplicative. */
export const MULTIPLY = 'MULTIPLY';
// The sampler names a program declares: the layer reads them through the
// backend, and the package's tests read them from here.
export { samplersOf } from './programs.js';

/**
 * A fullscreen-pass program from a fragment shader alone; for your own
 * vertex stage use `twgl.createProgramInfo`.
 * @param {WebGL2RenderingContext} gl
 * @param {string} frag  GLSL ES 3.00 fragment source; vTexCoord in, the input by declaration.
 * @returns {object|null} A twgl programInfo, or null on a compile error (logged by twgl).
 * @example
 * <caption>A fragment shader alone: red grows to the right, green upward.</caption>
 * const { createCanvas, program, filter } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const gradient = program(gl, `#version 300 es
 * precision highp float;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   outColor = vec4(vTexCoord, 0.5, 1.0);
 * }`)
 * filter(gl, gradient)
 */
export function program(gl, frag) {
  return programOf(contextOf(gl), frag);
}

/**
 * The covering geometry: two triangles in NDC, aTexCoord with v = 0 at the bottom.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} A twgl bufferInfo, cached per context.
 * @example
 * <caption>The covering quad drawn with bind and draw: an 8 × 6 checker of 50 px squares.</caption>
 * const { createCanvas, program, fullscreen, bind, draw } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const checker = program(gl, `#version 300 es
 * precision highp float;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   float cell = mod(floor(vTexCoord.x * 8.0) + floor(vTexCoord.y * 6.0), 2.0);
 *   outColor = vec4(mix(vec3(0.075, 0.553, 0.459), vec3(1.0, 0.82, 0.4), cell), 1.0);
 * }`)
 * bind(gl, checker)
 * draw(gl, fullscreen(gl))
 */
export function fullscreen(gl) {
  return fullscreenOf(contextOf(gl));
}

/**
 * Run a fullscreen pass over the current target. `uResolution` and
 * `uTexelSize` are filled when the program declares them, and `input` is bound
 * to every sampler the program declares that `uniforms` does not set.
 * @details bind(prog, uniforms) with the depth test off, then draw(fullscreen).
 * A stage names its own input — uSource where it has no better word, uScene or
 * its own where it has — and the argument reaches it by declaration, not by
 * name: a stage that reads no texture is handed none. The bag wins wherever it
 * sets a name, so a second texture (`uDepth`, `uHistory`) travels in the bag.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A pass program from program(gl, frag).
 * @param {object} [uniforms]  The pass's bag, by name; `null` when it has none.
 * @param {WebGLTexture|object} [input]  The image filtered: a texture, or a
 *        target (its `.color`). `uTexelSize` is its texel size, or — where the
 *        argument is absent — the bag's `uSource`.
 * @returns {object|null} The bound program, as `bind` returns it, or null where
 *        nothing was drawn: a `program(gl, frag)` that failed to compile is null,
 *        and a pass handed one runs nothing rather than half of something.
 * @example
 * <caption>A stage that names its own input: uScene, bound by the argument, shown colour-inverted — the green ground turns pink.</caption>
 * const { createCanvas, setCamera, axes, renderTarget, program, filter, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const scene = renderTarget(gl)
 * const invert = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uScene;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   outColor = vec4(1.0 - texture(uScene, vTexCoord).rgb, 1.0);
 * }`)
 *
 * twgl.bindFramebufferInfo(gl, scene)
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(gl, { size: 100 })
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * filter(gl, invert, null, scene)      // uScene takes the target's colour texture
 */
export function filter(gl, prog, uniforms, input) {
  return filterOf(contextOf(gl), prog, uniforms, input);
}

/**
 * The matrix taking the fullscreen quad ([−1, 1]²) to a pixel rect of the
 * viewport, in NDC.
 * @param {Float32Array} out  16 elements.
 * @param {number} x  The rect's left, target px.
 * @param {number} y  The rect's bottom, target px.
 * @param {number} w  The rect's width.
 * @param {number} h  The rect's height.
 * @param {number} vw  The viewport width.
 * @param {number} vh  The viewport height.
 * @returns {Float32Array} out
 * @ignore
 */
export function rectMatrix(out, x, y, w, h, vw, vh) {
  const x0 = 2 * x / vw - 1, x1 = 2 * (x + w) / vw - 1;
  const y0 = 2 * y / vh - 1, y1 = 2 * (y + h) / vh - 1;
  out.fill(0);
  out[0] = (x1 - x0) / 2; out[5] = (y1 - y0) / 2; out[10] = 1; out[15] = 1;
  out[12] = (x0 + x1) / 2; out[13] = (y0 + y1) / 2;
  return out;
}

/**
 * Draw a texture to the current target as an image.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {{ x?:number, y?:number, width?:number, height?:number, tint?:number[],
 *           mask?:boolean[], blend?:string }} [opts]
 *        The rect in target px from the bottom-left (default: cover); tint
 *        a multiplier (default white); mask a colorMask (RED, …); blend
 *        NORMAL · ADD · MULTIPLY (default: the state as it is). The previous
 *        program, depth test, mask and blend are restored after.
 *
 *        **Target px are the drawing buffer's, not the page's.** `createCanvas`
 *        sizes that buffer by the display's pixel ratio, so a rect given in
 *        logical pixels draws into a corner at 1/ratio scale on a HiDPI display.
 *        Scale a logical rect by `gl.drawingBufferWidth / gl.canvas.clientWidth`
 *        — the notebook's inset figures (`arcball`, `flock_cpu`, `volume_grid`)
 *        each carry that factor, and so does the example below — and a figure
 *        that draws with `filter()` or in world space never has the question.
 * @example
 * <caption>A target as a 160 × 120 inset, 20 px in from the bottom-left corner of a yellow canvas.</caption>
 * const { createCanvas, setCamera, axes, renderTarget, image, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const scene = renderTarget(gl)
 * twgl.bindFramebufferInfo(gl, scene)
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(gl, { size: 100 })
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * gl.clearColor(1, 0.82, 0.4, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * const s = gl.drawingBufferWidth / gl.canvas.clientWidth   // the inset is given in logical pixels
 * image(gl, scene.color, { x: 20 * s, y: 20 * s, width: 160 * s, height: 120 * s })
 */
export function image(gl, tex, opts) {
  const ctx = contextOf(gl);
  const prev = ctx.prog;
  imageOf(ctx, tex, opts);
  // the bound program comes back, as the reference documents: the layer's image
  // draws through the flat program and leaves it bound
  if (ctx.prog !== prev) {
    ctx.prog = prev || null;
    if (prev && prev.program) gl.useProgram(prev.program);
  }
}

/**
 * A pipe pass entry: a program, or { program, uniforms } for per-pass uniforms.
 * @param {object} entry
 * @returns {{ program:object, uniforms:object|null }|null}
 * @ignore
 */
export function passOf(entry) {
  if (!entry) return null;
  if (entry.program && entry.uniformSetters) return { program: entry, uniforms: null };
  if (entry.program) return { program: entry.program, uniforms: entry.uniforms || null };
  return null;
}

/**
 * Run a source through a chain of fullscreen passes and show the result on
 * the current target.
 * @details Ping-pongs between two targets cached under `key`.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture|object} source  A texture, or a target (its .color).
 * @param {object|object[]} passes  One pass or an array; each a program from
 *        program(gl, frag) or { program, uniforms }; falsy entries skipped.
 * @param {{ display?:boolean, allocate?:boolean, key?:string, ping?:object, pong?:object,
 *           clear?:boolean, clearFn?:function, clearDisplay?:boolean, clearDisplayFn?:function,
 *           draw?:function }} [opts]
 *        display (default true): image the result onto the target bound
 *        before the call. allocate (default true): make the keyed ping /
 *        pong when missing. key (default 'default'): the cached pair. ping /
 *        pong: your own targets, never cached. clear / clearFn(gl): clear a
 *        working target before its pass (default black). clearDisplay /
 *        clearDisplayFn(gl): the same for the display. draw(gl, tex, pass):
 *        how a pass renders its input (default: filter with the chain's
 *        texture as the pass's input argument).
 * @returns {object|null} The target holding the result, or null without passes.
 * @example
 * <caption>Pixelate into 20 × 20 cells, then invert: magenta turns green, yellow blue, the ground pink.</caption>
 * const { createCanvas, setCamera, pane, renderTarget, program, pipe, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const scene = renderTarget(gl)
 * const pixelate = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uSource;
 * uniform float uCells;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   outColor = texture(uSource, (floor(vTexCoord * uCells) + 0.5) / uCells);
 * }`)
 * const invert = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uSource;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   outColor = vec4(1.0 - texture(uSource, vTexCoord).rgb, 1.0);
 * }`)
 *
 * twgl.bindFramebufferInfo(gl, scene)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [0, 0, 170] }))
 * pane(gl, [-110, 70, 0], [30, 70, 0], [30, -70, 0], [-110, -70, 0], { color: [1, 0.31, 0.85, 1] })
 * pane(gl, [-30, 70, 1], [110, 70, 1], [110, -70, 1], [-30, -70, 1], { color: [1, 0.82, 0.4, 1] })
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * pipe(gl, scene, [{ program: pixelate, uniforms: { uCells: 20 } }, invert])
 */
export function pipe(gl, source, passes, opts) {
  const o = opts || {};
  // the bridge's entry rule: a twgl programInfo, or a { program, uniforms } bag
  const list = (Array.isArray(passes) ? passes : [passes]).map(passOf).filter(Boolean)
    .map((p) => (p.uniforms ? { program: p.program, uniforms: p.uniforms } : p.program));
  const forward = {
    display: o.display, allocate: o.allocate, key: o.key, clear: o.clear, clearDisplay: o.clearDisplay,
  };
  if ('ping' in o) forward.ping = o.ping;                 // the layer tells a supplied pair from a cached one by the key
  if ('pong' in o) forward.pong = o.pong;
  // the callbacks stay the reference's: they take gl, not the record
  if (typeof o.clearFn === 'function') forward.clearFn = () => o.clearFn(gl);
  if (typeof o.clearDisplayFn === 'function') forward.clearDisplayFn = () => o.clearDisplayFn(gl);
  if (typeof o.draw === 'function') forward.draw = (ctx, tex, pass) => o.draw(gl, tex, pass);
  return pipeOf(contextOf(gl), source, list, forward);
}

/**
 * Free the targets pipe cached: the default pair, a named key, or every
 * pair with true. Targets you supplied yourself are left alone.
 * @param {WebGL2RenderingContext} gl
 * @param {string|boolean} [key]
 * @example
 * <caption>Two turning squares: click to switch the pixelation off and on — on, their slanted edges step in coarse blocks; off, they are smooth. Switching it off releases the cached pair, so every time it comes back on pipe allocates a fresh one — the readout counts them.</caption>
 * const { createCanvas, setCamera, pane, renderTarget, program, pipe, releasePipe, image, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const canvas = gl.canvas
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 *
 * const scene = renderTarget(gl)
 * const pixelate = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uSource;
 * uniform float uCells;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   outColor = texture(uSource, (floor(vTexCoord * uCells) + 0.5) / uCells);
 * }`)
 * const cam = tree.createCamera({ eye: [0, 0, 170] })
 * let effect = true
 * let last = null, pairs = 0
 * // a square of half-diagonal 70 centred at (cx, 0), turned by a
 * const square = (cx, a, z) => [0, 1, 2, 3].map((k) => [cx + 70 * Math.cos(a - k * Math.PI / 2), 70 * Math.sin(a - k * Math.PI / 2), z])
 *
 * canvas.addEventListener('click', () => {
 *   effect = !effect
 *   if (!effect) releasePipe(gl, 'fx')
 * })
 *
 * function frame(ms) {
 *   const a = ms / 2000
 *   twgl.bindFramebufferInfo(gl, scene)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   pane(gl, ...square(-40, a, 0), { color: [1, 0.31, 0.85, 1] })
 *   pane(gl, ...square(40, -a, 1), { color: [1, 0.82, 0.4, 1] })
 *   twgl.bindFramebufferInfo(gl, SCREEN)
 *   if (effect) {
 *     const target = pipe(gl, scene, { program: pixelate, uniforms: { uCells: 16 } }, { key: 'fx' })
 *     if (target !== last) { last = target; pairs++ }
 *   } else image(gl, scene.color)
 *   out.textContent = (effect ? 'pixelated' : 'released') + ' · pairs allocated: ' + pairs
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function releasePipe(gl, key) {
  releasePipeOf(contextOf(gl), key);
}
