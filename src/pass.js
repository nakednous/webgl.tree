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

import { createProgramInfo, createBufferInfoFromArrays, bindFramebufferInfo, drawBufferInfo } from 'twgl.js';
import { contextOf } from './context.js';
import { bind, draw } from './draw.js';
import { renderTarget } from './target.js';
import { PASS_VERT, flatProgram, bindGeometry } from './programs.js';

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
// The blend modes by name: [srcRGB, dstRGB] factors, resolved on the context.
const _BLEND = {
  NORMAL: (gl) => [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA],
  ADD: (gl) => [gl.ONE, gl.ONE],
  MULTIPLY: (gl) => [gl.DST_COLOR, gl.ZERO],
};

const _vp = [0, 0, 0, 0];
const _rect = new Float32Array(16);
const _white = [1, 1, 1, 1];
const _res = [0, 0], _texel = [0, 0];

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
  return createProgramInfo(gl, [PASS_VERT, frag]) || null;
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
  const ctx = contextOf(gl);
  if (!ctx.quad) {
    ctx.quad = createBufferInfoFromArrays(gl, {
      aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
      aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
      indices: [0, 1, 2, 2, 1, 3],
    });
  }
  return ctx.quad;
}

const _viewport = (gl) => { const v = gl.getParameter(gl.VIEWPORT); _vp[0] = v[0]; _vp[1] = v[1]; _vp[2] = v[2]; _vp[3] = v[3]; return _vp; };

// The sampler uniforms a program declares, read once per program and kept on it
// under a private key. `filter` binds the pass's input to each of them that the
// bag leaves unset — the same rule by which it already fills uResolution and
// uTexelSize only where a stage declares them.
const SAMPLERS = Symbol('webgl.tree.samplers');
const UNSET = Symbol('webgl.tree.unsetSamplerLogged');
const _SAMPLER_TYPES = ['SAMPLER_2D', 'SAMPLER_3D', 'SAMPLER_CUBE', 'SAMPLER_2D_SHADOW', 'SAMPLER_CUBE_SHADOW',
  'SAMPLER_2D_ARRAY', 'SAMPLER_2D_ARRAY_SHADOW', 'INT_SAMPLER_2D', 'INT_SAMPLER_3D', 'INT_SAMPLER_CUBE',
  'INT_SAMPLER_2D_ARRAY', 'UNSIGNED_INT_SAMPLER_2D', 'UNSIGNED_INT_SAMPLER_3D', 'UNSIGNED_INT_SAMPLER_CUBE',
  'UNSIGNED_INT_SAMPLER_2D_ARRAY'];

/** Whether a GL uniform type is one of the sampler types. @ignore */
function _isSampler(gl, type) {
  for (let i = 0; i < _SAMPLER_TYPES.length; i++) if (gl[_SAMPLER_TYPES[i]] === type) return true;
  return false;
}

/**
 * The names of a program's sampler uniforms, in declaration order, cached on
 * the program. An array of samplers contributes its base name, the key twgl's
 * setters use.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A programInfo.
 * @returns {string[]} @ignore
 */
export function samplersOf(gl, prog) {
  let names = prog[SAMPLERS];
  if (names) return names;
  names = [];
  const n = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog.program, i);
    if (info && _isSampler(gl, info.type)) names.push(info.name.replace(/\[0\]$/, ''));
  }
  Object.defineProperty(prog, SAMPLERS, { value: names, configurable: true });
  return names;
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
 *        argument is absent — the bag's `uSource` / `tex0`.
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
  const ctx = contextOf(gl);
  const depth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth) gl.disable(gl.DEPTH_TEST);
  const bound = bind(gl, prog, uniforms);
  if (!bound) {                                   // nothing drawn: the state as it was
    if (depth) gl.enable(gl.DEPTH_TEST);
    return null;
  }
  const s = prog.uniformSetters;
  // the input, normalized as pipe's source is: a texture, or a target's colour
  const tex = input && typeof input === 'object' && input.color ? input.color : input;
  const names = samplersOf(gl, prog);
  let unset = null;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (uniforms && uniforms[n] !== undefined) continue;      // the bag's own value wins
    if (tex) { const set = s[n]; if (typeof set === 'function') set(tex); }
    else if (!unset) unset = n;
  }
  if (unset && !prog[UNSET]) {
    prog[UNSET] = true;
    console.error('[webgl.tree] filter: the program declares the sampler `' + unset +
      '` and neither `uniforms` nor `input` sets it — it reads whatever texture unit it holds.');
  }
  const vp = _viewport(gl);
  if (typeof s.uResolution === 'function') { _res[0] = vp[2]; _res[1] = vp[3]; s.uResolution(_res); }
  if (typeof s.uTexelSize === 'function') {
    const src = tex || (uniforms && (uniforms.uSource || uniforms.tex0));
    const size = (src && ctx.sizes.get(src)) || null;
    _texel[0] = 1 / (size ? size[0] : vp[2]); _texel[1] = 1 / (size ? size[1] : vp[3]);
    s.uTexelSize(_texel);
  }
  draw(gl, fullscreen(gl));
  if (depth) gl.enable(gl.DEPTH_TEST);
  return bound;
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
 * image(gl, scene.color, { x: 20, y: 20, width: 160, height: 120 })
 */
export function image(gl, tex, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  const vp = _viewport(gl);
  const x = o.x || 0, y = o.y || 0, w = o.width || vp[2], h = o.height || vp[3];
  const prev = ctx.prog;
  const depth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth) gl.disable(gl.DEPTH_TEST);
  let mask = null;
  if (o.mask) { mask = gl.getParameter(gl.COLOR_WRITEMASK); gl.colorMask(o.mask[0], o.mask[1], o.mask[2], o.mask[3]); }
  let blend = null;
  if (o.blend && _BLEND[o.blend]) {
    blend = [gl.isEnabled(gl.BLEND), gl.getParameter(gl.BLEND_SRC_RGB), gl.getParameter(gl.BLEND_DST_RGB), gl.getParameter(gl.BLEND_SRC_ALPHA), gl.getParameter(gl.BLEND_DST_ALPHA)];
    const f = _BLEND[o.blend](gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(f[0], f[1]);
  }
  const flat = flatProgram(gl);
  bind(gl, flat, { uTexture: tex, uUseTexture: true, uColor: o.tint || _white });
  // the flat program declares uModelViewProjectionMatrix, which draw() would refill from the camera: the rect goes in directly
  flat.uniformSetters.uModelViewProjectionMatrix(rectMatrix(_rect, x, y, w, h, vp[2], vp[3]));
  const quad = fullscreen(gl);
  bindGeometry(gl, flat, quad);
  drawBufferInfo(gl, quad);
  if (blend) { if (!blend[0]) gl.disable(gl.BLEND); gl.blendFuncSeparate(blend[1], blend[2], blend[3], blend[4]); }
  if (mask) gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
  if (depth) gl.enable(gl.DEPTH_TEST);
  if (prev && prev !== flat) { gl.useProgram(prev.program); ctx.prog = prev; }
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

const _clearBlack = (gl) => { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };

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
  const ctx = contextOf(gl);
  const o = opts || {};
  const list = (Array.isArray(passes) ? passes : [passes]).map(passOf).filter(Boolean);
  const display = o.display ?? true;
  const allocate = o.allocate ?? true;
  const key = o.key ?? 'default';
  const clearFn = typeof o.clearFn === 'function' ? o.clearFn : _clearBlack;
  const clearDisplayFn = typeof o.clearDisplayFn === 'function' ? o.clearDisplayFn : clearFn;
  const drawPass = typeof o.draw === 'function' ? o.draw : (g, tex, pass) => filter(g, pass.program, pass.uniforms, tex);
  if (source && typeof source.resolve === 'function') source.resolve();   // a multisampled target fills its textures first
  const srcTex = source && source.color ? source.color : source;
  const outer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const vp = _viewport(gl);
  const restore = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, outer); gl.viewport(vp[0], vp[1], vp[2], vp[3]); };

  if (!list.length) {
    if (display && srcTex) { if (o.clearDisplay ?? true) clearDisplayFn(gl); image(gl, srcTex); }
    return null;
  }
  const size = (source && source.width) ? [source.width, source.height] : (ctx.sizes.get(srcTex) || [vp[2], vp[3]]);
  const hasPing = Object.prototype.hasOwnProperty.call(o, 'ping');
  const hasPong = Object.prototype.hasOwnProperty.call(o, 'pong');
  const store = ctx.pipes[key] || (ctx.pipes[key] = {});
  let ping = hasPing ? o.ping : store.ping;
  let pong = hasPong ? o.pong : store.pong;
  if (allocate) {
    if (!ping && !hasPing) ping = renderTarget(gl, { width: size[0], height: size[1], depth: false });
    if (!pong && !hasPong) pong = renderTarget(gl, { width: size[0], height: size[1], depth: false });
    if (!hasPing) store.ping = ping;
    if (!hasPong) store.pong = pong;
  }
  if (!ping || !pong) {
    if (display && srcTex) { restore(); if (o.clearDisplay ?? true) clearDisplayFn(gl); drawPass(gl, srcTex, list[0]); }
    return null;
  }
  for (const t of [ping, pong]) if (t.width !== size[0] || t.height !== size[1]) t.resize(size[0], size[1]);

  let readTex = srcTex, out = null;
  for (let i = 0; i < list.length; i++) {
    const dst = i % 2 === 0 ? ping : pong;
    bindFramebufferInfo(gl, dst);
    if (o.clear ?? true) clearFn(gl);
    drawPass(gl, readTex, list[i]);
    readTex = dst.color;
    out = dst;
  }
  restore();
  if (display && readTex) { if (o.clearDisplay ?? true) clearDisplayFn(gl); image(gl, readTex); }
  return out;
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
  const ctx = contextOf(gl);
  const free = (k) => {
    const pair = ctx.pipes[k];
    if (!pair) return;
    if (pair.ping) pair.ping.dispose();
    if (pair.pong) pair.pong.dispose();
    delete ctx.pipes[k];
  };
  if (key === true) { for (const k of Object.keys(ctx.pipes)) free(k); return; }
  free(typeof key === 'string' ? key : 'default');
}
