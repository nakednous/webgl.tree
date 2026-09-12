/**
 * @file Passes — program(frag), fullscreen, filter, image, pipe.
 * @module twgl.tree/pass
 * @license AGPL-3.0-only
 *
 *   program(gl, frag)                // the fragment source with the fixed NDC pass-through vertex stage
 *   fullscreen(gl)                   // the cached covering geometry, aTexCoord bottom-up (GL's orientation)
 *   filter(gl, prog, uniforms)       // bind + draw(fullscreen), depth test off; the image arrives as tex0
 *   image(gl, tex, opts)             // draw a texture to the current target: { x, y, width, height, tint, mask, blend }
 *   pipe(gl, source, passes, opts)   // the ping-pong chain; releasePipe(gl, key | true) frees its cached targets
 *
 * filter fills uResolution (the current viewport) and uTexelSize
 * ([1 / w, 1 / h] of tex0) only when the program declares them. image goes
 * through the internal flat program with a rect in target pixels, origin
 * bottom-left, default cover; no flip option anywhere — orientation is
 * settled at upload.
 */

'use strict';

import { createProgramInfo, createBufferInfoFromArrays, bindFramebufferInfo, setBuffersAndAttributes, drawBufferInfo } from 'twgl.js';
import { contextOf } from './context.js';
import { bind, draw } from './draw.js';
import { renderTarget } from './target.js';
import { PASS_VERT, flatProgram } from './programs.js';

/** Colour write masks for image's `mask`. */
export const RED = [true, false, false, false];
export const GREEN = [false, true, false, false];
export const BLUE = [false, false, true, false];
export const ALPHA = [false, false, false, true];
export const RGB = [true, true, true, false];

/** Blend modes for image's `blend`: [srcRGB, dstRGB] factors by name, resolved on the context. */
export const NORMAL = 'NORMAL';
export const ADD = 'ADD';
export const MULTIPLY = 'MULTIPLY';
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
 * A fullscreen-pass program: the fragment source with the bridge's
 * pass-through vertex stage. The two-argument program is twgl's
 * createProgramInfo.
 * @param {WebGL2RenderingContext} gl
 * @param {string} frag  GLSL ES 3.00 fragment source; vTexCoord in, tex0 by convention.
 * @returns {object|null} A twgl programInfo, or null on a compile error (logged by twgl).
 */
export function program(gl, frag) {
  return createProgramInfo(gl, [PASS_VERT, frag]) || null;
}

/**
 * The covering geometry: two triangles in NDC, aTexCoord with v = 0 at the bottom.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} A twgl bufferInfo, cached per context.
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

/**
 * Run a fullscreen pass: bind(prog, uniforms) with the depth test off, then
 * draw(fullscreen). uResolution and uTexelSize are filled iff declared.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A pass program from program(gl, frag).
 * @param {object} [uniforms]  tex0 is the image filtered.
 */
export function filter(gl, prog, uniforms) {
  const ctx = contextOf(gl);
  const depth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth) gl.disable(gl.DEPTH_TEST);
  if (!bind(gl, prog, uniforms)) return;
  const s = prog.uniformSetters;
  const vp = _viewport(gl);
  if (typeof s.uResolution === 'function') { _res[0] = vp[2]; _res[1] = vp[3]; s.uResolution(_res); }
  if (typeof s.uTexelSize === 'function') {
    const size = (uniforms && uniforms.tex0 && ctx.sizes.get(uniforms.tex0)) || null;
    _texel[0] = 1 / (size ? size[0] : vp[2]); _texel[1] = 1 / (size ? size[1] : vp[3]);
    s.uTexelSize(_texel);
  }
  draw(gl, fullscreen(gl));
  if (depth) gl.enable(gl.DEPTH_TEST);
}

/**
 * The matrix taking the fullscreen quad ([−1, 1]²) to a pixel rect of the
 * viewport, in NDC.
 * @param {Float32Array} out  16 elements.
 * @param {number} x, y  The rect's bottom-left, target px.
 * @param {number} w, h  The rect's size, target px.
 * @param {number} vw, vh  The viewport size.
 * @returns {Float32Array} out
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
  setBuffersAndAttributes(gl, flat, quad);
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
 */
export function passOf(entry) {
  if (!entry) return null;
  if (entry.program && entry.uniformSetters) return { program: entry, uniforms: null };
  if (entry.program) return { program: entry.program, uniforms: entry.uniforms || null };
  return null;
}

const _clearBlack = (gl) => { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };

/**
 * Run a source through a chain of fullscreen passes, ping-ponging between
 * two cached targets, and show the result on the current target.
 *
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
 *        how a pass renders its input (default filter with tex0).
 * @returns {object|null} The target holding the result, or null without passes.
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
  const drawPass = typeof o.draw === 'function' ? o.draw : (g, tex, pass) => filter(g, pass.program, pass.uniforms ? Object.assign({ tex0: tex }, pass.uniforms) : { tex0: tex });
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
