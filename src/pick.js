/**
 * @file Picking — an asynchronous pixel readback and colour-id scene picking.
 * @module webgl.tree/pick
 * @license AGPL-3.0-only
 *
 * `pick` finds the object under a screen-space pixel: draw the scene calling
 * `paint(id)` before each object, and the promise resolves to that id.
 * `readPixel` reads one pixel of any target without stalling the GPU — a target's
 * own pixels: for the canvas, cross a canvas pixel with `fragCoord` first.
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
import { contextOf } from './context.js';
import { installCamera } from './camera.js';
import { renderTarget } from './target.js';
import { canvasViewport } from './space.js';

const _rgba = [0, 0, 0, 1];
const _Ppick = new Float32Array(16);
const _V = new Float32Array(16);
const _P = new Float32Array(16);

/**
 * Read one pixel of a target back asynchronously.
 * @param {WebGL2RenderingContext} gl
 * @param {object|null} fbo  A render target, or `SCREEN`.
 * @param {number} x  Pixel column in the target, from the left — window space, device pixels; `fragCoord` converts a logical pixel.
 * @param {number} y  Pixel row in the target, from the bottom.
 * @returns {Promise<Uint8Array>} The four bytes, RGBA.
 * @example
 * <caption>The centre pixel read back each frame: 255 79 216 while the magenta square passes over it, 19 141 117 otherwise.</caption>
 * const { createCanvas, setCamera, pane, readPixel, fragCoord, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 *
 * const cam = tree.createCamera({ eye: [0, 0, 280] })
 * const centre = fragCoord(gl, [0, 0], 200, 150)   // the canvas centre, in window space
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
 *     readPixel(gl, SCREEN, centre[0], centre[1]).then((px) => {
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
  return ctx.backend.readPixels(ctx, fbo, x, y);   // a PBO, a fence, and the bridge's own frame loop
}

/**
 * The id of the object under a screen-space pixel, 0 for a miss.
 * @details Colour-id picking into a cached 1×1 target; ids run 1 … 2²⁴ − 1.
 * @param {WebGL2RenderingContext} gl
 * @param {number} x  The query pixel's column, logical pixels — a pointer event's offset as is.
 * @param {number} y  Its row, from the top.
 * @param {function(function(number):void):void} drawFn  Draws the scene; call paint(id) before each object's draw.
 * @param {{ program?:object, vp?:number[], sync?:boolean }} [opts]  program: an id program with a uColor uniform in place of the flat one. vp: the viewport the coordinates are in, [x, y, w, h] signed. sync: read the pixel back at once, stalling the GPU; the promise resolves in the same tick.
 * @returns {Promise<number>} The id under the pixel, 0 for a miss.
 * @example
 * <caption>Hover a cube: the one under the pointer turns magenta.</caption>
 * const { createCanvas, setCamera, bind, draw, pick, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const canvas = gl.canvas
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
 * const cubes = [-120, 0, 120].map((x, i) => ({ id: i + 1, M: tree.mat4FromTRS(tree.mat4(), x, 0, 0, 0, 0, 0, 1, 1, 1, 1) }))
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
  const vp = ctx.backend.setViewport(ctx);
  const prevFbo = ctx.backend.bindTarget(ctx);
  const pvp = o.vp || canvasViewport(gl);
  _V.set(ctx.V); _P.set(ctx.P);
  _Ppick.set(ctx.P);
  mat4Pick(_Ppick, x, y, pvp);
  const prevProg = ctx.prog;
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  const prog = o.program || ctx.backend.imageProgram(ctx);

  ctx.backend.bindTarget(ctx, target);
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
    ctx.backend.bindTarget(ctx, prevFbo);
    ctx.backend.setViewport(ctx, vp);
  }
  if (syncId >= 0) return Promise.resolve(syncId);
  return readPixel(gl, target, 0, 0).then((px) => rgbaToId(px[0], px[1], px[2]));
}
const _px = new Uint8Array(4);
