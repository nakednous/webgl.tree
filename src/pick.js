/**
 * @file Picking — an asynchronous pixel readback and colour-id scene picking.
 * @module twgl.tree/pick
 * @license AGPL-3.0-only
 *
 * `pick` finds the object under a canvas pixel: draw the scene calling
 * `paint(id)` before each object, and the promise resolves to that id.
 * `readPixel` reads one pixel of any target without stalling the GPU.
 *
 * ```
 * readPixel(gl, fbo, x, y) → Promise<Uint8Array>   // a frame or more late
 * pick(gl, x, y, drawFn, opts) → Promise<number>    // 0 a miss
 * ```
 *
 * @details
 * readPixel binds the target, reads into a PIXEL_PACK_BUFFER, fences, and
 * polls clientWaitSync on the bridge's own requestAnimationFrame loop —
 * alive only while readbacks are pending — so no application or host hook
 * is needed. Results land one or more frames late by construction.
 *
 * pick renders drawFn into a cached 1×1 target under the installed camera
 * narrowed with mat4Pick onto the query pixel, the internal flat program
 * bound (or opts.program); paint(id) sets the bound program's uColor to the
 * id's colour, the counterpart of fill(tag(id)); the pixel read back decodes
 * with rgbaToId. Ids run 1 … 2²⁴ − 1. Handles never come here: their grab is
 * the host's analytic path. This is scene picking only.
 */

'use strict';

import { mat4Pick, idToRgba, rgbaToId } from '@nakednous/tree';
import { bindFramebufferInfo } from 'twgl.js';
import { contextOf } from './context.js';
import { installCamera } from './camera.js';
import { renderTarget } from './target.js';
import { flatProgram } from './programs.js';

const _rgba = [0, 0, 0, 1];
const _Ppick = new Float32Array(16);
const _V = new Float32Array(16);
const _P = new Float32Array(16);
const _vp = [0, 0, 0, 0];
const _pickVp = [0, 0, 0, 0];

function _pending(ctx) {
  if (!ctx.readbacks) ctx.readbacks = { list: [], pool: [], polling: false };
  return ctx.readbacks;
}

function _poll(gl, ctx) {
  const rb = _pending(ctx);
  const raf = ctx.raf || ((cb) => requestAnimationFrame(cb));
  const step = () => {
    rb.polling = false;
    if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
      for (const r of rb.list) r.reject(new Error('[twgl.tree] readPixel: the context was lost.'));
      rb.list.length = 0;
      return;
    }
    for (let i = rb.list.length - 1; i >= 0; i--) {
      const r = rb.list[i];
      const status = gl.clientWaitSync(r.sync, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) continue;
      rb.list.splice(i, 1);
      gl.deleteSync(r.sync);
      if (status === gl.WAIT_FAILED) { rb.pool.push(r.pbo); r.reject(new Error('[twgl.tree] readPixel: the fence failed.')); continue; }
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, r.out);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      rb.pool.push(r.pbo);
      r.resolve(r.out);
    }
    if (rb.list.length && !rb.polling) { rb.polling = true; raf(step); }
  };
  if (!rb.polling) { rb.polling = true; raf(step); }
}

/**
 * Read one pixel of a target back asynchronously.
 * @param {WebGL2RenderingContext} gl
 * @param {object|null} fbo  A render target, or `SCREEN`.
 * @param {number} x  Pixel column in the target, from the left.
 * @param {number} y  Pixel row in the target, from the bottom.
 * @returns {Promise<Uint8Array>} The four bytes, RGBA.
 * @example
 * <caption>The centre pixel read back each frame: 255 79 216 while the magenta square passes over it, 19 141 117 otherwise.</caption>
 * import { setCamera, pane, readPixel, SCREEN, tree } from 'twgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 *
 * const cam = tree.createCamera({ eye: [0, 0, 280] })
 * let pending = false
 *
 * function frame(ms) {
 *   const x = 150 * Math.sin(ms / 1000)
 *   gl.clearColor(19 / 255, 141 / 255, 117 / 255, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   pane(gl, [x - 30, 30, 0], [x + 30, 30, 0], [x + 30, -30, 0], [x - 30, -30, 0], { color: [1, 79 / 255, 216 / 255, 1] })
 *   if (!pending) {
 *     pending = true
 *     readPixel(gl, SCREEN, 200, 150).then((px) => {
 *       out.textContent = 'centre ' + px.slice(0, 3).join(' ')
 *       pending = false
 *     })
 *   }
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function readPixel(gl, fbo, x, y) {
  const ctx = contextOf(gl);
  const rb = _pending(ctx);
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const vp = gl.getParameter(gl.VIEWPORT);
  _vp[0] = vp[0]; _vp[1] = vp[1]; _vp[2] = vp[2]; _vp[3] = vp[3];
  // a multisampled target is read from its resolved textures
  bindFramebufferInfo(gl, fbo && typeof fbo.resolve === 'function' ? fbo.resolve().resolved : fbo);
  const pbo = rb.pool.pop() || gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
  gl.viewport(_vp[0], _vp[1], _vp[2], _vp[3]);
  return new Promise((resolve, reject) => {
    rb.list.push({ sync, pbo, out: new Uint8Array(4), resolve, reject });
    _poll(gl, ctx);
  });
}

/**
 * The id of the object under a canvas pixel, 0 for a miss.
 * @details Colour-id picking into a cached 1×1 target; ids run 1 … 2²⁴ − 1.
 * @param {WebGL2RenderingContext} gl
 * @param {number} x  The query pixel's column: CSS px with a host attached, else drawing-buffer px.
 * @param {number} y  Its row, from the top.
 * @param {function(function(number):void):void} drawFn  Draws the scene; call paint(id) before each object's draw.
 * @param {{ program?:object, vp?:number[], sync?:boolean }} [opts]  program: an id program with a uColor uniform in place of the flat one. vp: the viewport the coordinates are in, [x, y, w, h] signed. sync: read the pixel back at once, stalling the GPU; the promise resolves in the same tick.
 * @returns {Promise<number>} The id under the pixel, 0 for a miss.
 * @example
 * <caption>Hover a cube: the one under the pointer turns magenta.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, bind, draw, pick, tree } from 'twgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * in vec3 aNormal;
 * uniform mat4 uModelViewProjectionMatrix;
 * uniform mat3 uNormalMatrix;
 * out vec3 vNormal;
 * void main() {
 *   vNormal = uNormalMatrix * aNormal;
 *   gl_Position = uModelViewProjectionMatrix * aPosition;
 * }`, `#version 300 es
 * precision highp float;
 * in vec3 vNormal;
 * uniform vec3 uColor;
 * out vec4 outColor;
 * void main() {
 *   float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 1.0))), 0.0);
 *   outColor = vec4(uColor * (0.3 + 0.7 * d), 1.0);
 * }`])
 * const verts = twgl.primitives.createCubeVertices(80)
 * const box = twgl.createBufferInfoFromArrays(gl, { aPosition: verts.position, aNormal: verts.normal, indices: verts.indices })
 * const cubes = [-120, 0, 120].map((x, i) => ({ id: i + 1, M: tree.mat4FromTRS(new Float32Array(16), x, 0, 0, 0, 0, 0, 1, 1, 1, 1) }))
 * const cam = tree.createCamera({ eye: [99, 131, 263] })
 *
 * let mx = -1, my = -1, picked = 0, pending = false
 * canvas.addEventListener('pointermove', (e) => { mx = e.offsetX; my = e.offsetY })
 * canvas.addEventListener('pointerleave', () => { mx = my = -1; picked = 0 })
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   if (mx >= 0 && !pending) {
 *     pending = true
 *     pick(gl, mx, my, (paint) => {
 *       for (const c of cubes) {
 *         paint(c.id)
 *         draw(gl, box, c.M)
 *       }
 *     }).then((id) => {
 *       picked = id
 *       pending = false
 *     })
 *   }
 *   for (const c of cubes) {
 *     bind(gl, prog, { uColor: c.id === picked ? [1, 0.31, 0.85] : [1, 0.82, 0.4] })
 *     draw(gl, box, c.M)
 *   }
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function pick(gl, x, y, drawFn, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  if (!ctx.pickTarget) ctx.pickTarget = renderTarget(gl, { width: 1, height: 1 });
  const target = ctx.pickTarget;
  const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const vp = gl.getParameter(gl.VIEWPORT);
  _vp[0] = vp[0]; _vp[1] = vp[1]; _vp[2] = vp[2]; _vp[3] = vp[3];
  let pvp = o.vp;
  if (!pvp) {
    if (ctx.host && ctx.host.view) pvp = ctx.host.view.vp;
    else { _pickVp[0] = 0; _pickVp[1] = vp[3]; _pickVp[2] = vp[2]; _pickVp[3] = -vp[3]; pvp = _pickVp; }
  }
  _V.set(ctx.V); _P.set(ctx.P);
  _Ppick.set(ctx.P);
  mat4Pick(_Ppick, x, y, pvp);
  const prevProg = ctx.prog;
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  const prog = o.program || flatProgram(gl);

  bindFramebufferInfo(gl, target);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  installCamera(ctx, ctx.V, _Ppick);
  gl.useProgram(prog.program);
  ctx.prog = prog;
  // the id program's sampler sits on unit 0, which may still hold the target's own texture: a feedback loop drops every draw
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  if (prog.uniformSetters.uUseTexture) prog.uniformSetters.uUseTexture(false);
  const paint = (id) => { if (prog.uniformSetters.uColor) prog.uniformSetters.uColor(idToRgba(_rgba, id)); };
  let syncId = -1;
  try {
    drawFn(paint);
    if (o.sync) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); syncId = rgbaToId(_px[0], _px[1], _px[2]); }
  } finally {
    installCamera(ctx, _V, _P);
    if (!wasDepth) gl.disable(gl.DEPTH_TEST);
    if (prevProg) gl.useProgram(prevProg.program);
    ctx.prog = prevProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(_vp[0], _vp[1], _vp[2], _vp[3]);
  }
  if (syncId >= 0) return Promise.resolve(syncId);
  return readPixel(gl, target, 0, 0).then((px) => rgbaToId(px[0], px[1], px[2]));
}
const _px = new Uint8Array(4);
