/**
 * @file Picking — an asynchronous pixel readback and colour-id scene picking.
 * @module twgl.tree/pick
 * @license AGPL-3.0-only
 *
 *   readPixel(gl, fbo, x, y) → Promise<Uint8Array>   // one pixel back, a frame or more late
 *   pick(gl, x, y, drawFn, opts) → Promise<number>    // the id under a canvas pixel, 0 a miss
 *
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
 * @param {object|null} fbo  A render target, or SCREEN.
 * @param {number} x, y  Pixel coordinates in the target, origin bottom-left.
 * @returns {Promise<Uint8Array>} The four bytes, RGBA.
 */
export function readPixel(gl, fbo, x, y) {
  const ctx = contextOf(gl);
  const rb = _pending(ctx);
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const vp = gl.getParameter(gl.VIEWPORT);
  _vp[0] = vp[0]; _vp[1] = vp[1]; _vp[2] = vp[2]; _vp[3] = vp[3];
  bindFramebufferInfo(gl, fbo);
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
 * Colour-id scene picking at a canvas pixel.
 * @param {WebGL2RenderingContext} gl
 * @param {number} x, y  The query pixel, y down, in the attached host's
 *        logical canvas px when there is one, else in drawing-buffer px.
 * @param {function(function(number):void):void} drawFn  Draws the scene; call paint(id) before each object's draw.
 * @param {{ program?:object, vp?:number[], sync?:boolean }} [opts]  program: an id program with a uColor uniform in place of the flat one. vp: the viewport the coordinates are in, [x, y, w, h] signed. sync: read the pixel back at once with readPixels, stalling the pipeline — p5's way; the promise then resolves in the same tick.
 * @returns {Promise<number>} The id under the pixel, 0 for a miss.
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

  if (!o.debug) bindFramebufferInfo(gl, target);   // debug: the id pass lands on the current target, full size
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  installCamera(ctx, ctx.V, _Ppick);
  gl.useProgram(prog.program);
  ctx.prog = prog;
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
  if (o.debug) return Promise.resolve(0);
  if (syncId >= 0) return Promise.resolve(syncId);
  return readPixel(gl, target, 0, 0).then((px) => rgbaToId(px[0], px[1], px[2]));
}
const _px = new Uint8Array(4);
