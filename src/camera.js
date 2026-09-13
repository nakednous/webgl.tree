/**
 * @file The camera install — the transforms every draw reads.
 * @module twgl.tree/camera
 * @license AGPL-3.0-only
 *
 *   setCamera(gl, V, P, opts)   // from matrices
 *   setCamera(gl, cam, opts)    // from a camera state: V = cameraView(cam), P = cameraProj(cam, aspect, WEBGL)
 *
 * Both copy V and P into the context, recompute P · V and, with a host,
 * write the same matrices into its view bag, so handles, labels and the
 * orbit see the camera the draws use. The state form is the seam a track, a
 * helm, an orbit or a measured pose fills: they write cam, the frame calls
 * setCamera(gl, cam).
 */

'use strict';

import { cameraView, cameraProj, mat4Mul } from '@nakednous/tree';
import { contextOf } from './context.js';

const _V = new Float32Array(16);
const _P = new Float32Array(16);

const _isCameraState = (c) => !!(c && c.eye && c.center && c.up);
const _isMat4 = (m) => m != null && typeof m === 'object' && typeof m.length === 'number' && m.length >= 16;

/**
 * Install V and P on a context alone — no host write. What the HUD and the
 * rig overload use to swap the camera for a few draws and put it back.
 * @param {object} ctx
 * @param {ArrayLike<number>} V
 * @param {ArrayLike<number>} P
 */
export function installCamera(ctx, V, P) {
  for (let i = 0; i < 16; i++) { ctx.V[i] = V[i]; ctx.P[i] = P[i]; }
  mat4Mul(ctx.PV, ctx.P, ctx.V);
}

/**
 * Install the view and projection a draw uses.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {ArrayLike<number>|object} V  A view mat4, or a camera state.
 * @param {ArrayLike<number>|object} [P]  A projection mat4 (the matrix form), or opts (the state form).
 * @param {{ host?:object, aspect?:number }} [opts]
 *        host: a host to write the view bag into, beside the one attached at
 *        init. aspect: the state form's projection aspect (default the
 *        drawing buffer's).
 * @returns {object} The context's view bag.
 */
export function setCamera(gl, V, P, opts) {
  const ctx = contextOf(gl);
  let o = opts, view, proj;
  if (_isCameraState(V)) {
    o = P;
    const cam = V;
    const aspect = (o && typeof o.aspect === 'number') ? o.aspect
      : (gl.drawingBufferHeight ? gl.drawingBufferWidth / gl.drawingBufferHeight : 1);
    view = cameraView(_V, cam);
    proj = cameraProj(_P, cam, aspect, ctx.ndcZMin) || ctx.P;   // a state with no lens keeps the projection installed
  } else if (_isMat4(V) && _isMat4(P)) {
    view = V; proj = P;
  } else {
    console.error('[twgl.tree] setCamera: pass (gl, V, P) matrices or (gl, cam) a camera state.');
    return ctx.host ? ctx.host.view : ctx.view;
  }
  installCamera(ctx, view, proj);
  ctx.view.set(ctx.P, ctx.V);
  const host = (o && o.host) || ctx.host;
  if (host && host.view) host.view.set(ctx.P, ctx.V);
  return host ? host.view : ctx.view;
}
