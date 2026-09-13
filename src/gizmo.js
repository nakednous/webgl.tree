/**
 * @file Gizmos — the line pipe over the core generators, HUD mode, panes.
 * @module twgl.tree/gizmo
 * @license AGPL-3.0-only
 *
 * Thin generator-then-draw wrappers, each (gl, subject?, opts) with
 * { M, color, bits, size, … } and no ambient state, named as in p5.tree:
 *
 *   axes(gl, opts) · grid(gl, opts) · hermite(gl, p0, t0, p1, t1, opts)
 *   cross(gl, opts) · bullsEye(gl, opts)                 // HUD space, { x, y } in target px, y down
 *   viewFrustum(gl, opts) · trackPath(gl, track, opts) · helmRig(gl, helm, opts) · handleLocus(gl, h, opts)
 *   pane(gl, p0, p1, p2, p3, opts)                       // a textured or flat quad
 *   beginHUD(gl) · endHUD(gl)                            // an orthographic P over the viewport, y down
 *
 * The pipe: one internal program per context (aPosition, optional aColor,
 * uPV, uModel, uColor), drawn as gl.LINES. Each gizmo owns one cached
 * bufferInfo per context, allocated from the generator's returned count and
 * grown when it exceeds capacity; per frame the generator writes into the
 * cached arrays and the buffer is re-uploaded — zero allocation once warm.
 * Depth test on by default; { depth: false } for overlays. One-pixel GL
 * lines. Colour is semantic where the generator writes a palette (axes, the
 * helm rig), else opts.color (default white). A gizmo binds its own program
 * and restores the one bound before it.
 */

'use strict';

import {
  createArrays, growArrays, capacityOf,
  axesLines, gridLines, crossLines, bullsEyeLines, frustumLines, frustumCorners, hermiteLines,
  pathLines, helmRigLines, locusLines, paneTris,
  mat4Ortho, mat4Mul, mat4MulPoint, mat4FromTRS, pixelRatio, createCamera,
  X, Y, _Z, X as AX_X, _X, _Y, Z, NEAR, FAR, BODY, APEX, PATH, HANDLES, HANDLE, AIM, LOCUS, RING, TRANSLATE, ROTATE, POINT, WEBGL,
} from '@nakednous/tree';
import { helmBasis } from '@nakednous/host';
import { createBufferInfoFromArrays, setAttribInfoBufferFromArray, setBuffersAndAttributes, drawBufferInfo, bindFramebufferInfo } from 'twgl.js';
import { contextOf, viewOf } from './context.js';
import { setCamera } from './camera.js';
import { renderTarget } from './target.js';
import { image } from './pass.js';
import { lineProgram, flatProgram } from './programs.js';

const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
const WHITE = [1, 1, 1, 1];
const _M = new Float32Array(16);      // a composed model matrix
const _R = new Float32Array(16);      // a basis' rotation block
const _P = new Float32Array(16);      // the HUD projection
const _V = new Float32Array(16);      // a saved view
const _P2 = new Float32Array(16);     // a saved projection
const _p = [0, 0, 0];                 // a point
const _c24 = new Float64Array(24);    // frustum corners
const _cam = createCamera();          // a track's evaluated state
const _rigCam = createCamera({ fov: null, halfHeight: 90, near: 0.1, far: 960 });
const _vp = [0, 0, 0, 0];

/** The gizmo names the pipe caches, one buffer each per context. */
const _keyed = (ctx, name, opts) => {
  let g = ctx.gizmos[name];
  if (!g) {
    g = { arrays: createArrays(64, opts), buffer: null, capacity: 0, tris: !!(opts && opts.texcoord) };
    ctx.gizmos[name] = g;
  }
  return g;
};

const _arraysOf = (g) => {
  const a = { aPosition: g.arrays.position };
  if (g.arrays.color) a.aColor = g.arrays.color;
  if (g.arrays.texcoord) a.aTexCoord = g.arrays.texcoord;
  return a;
};

/**
 * Run a generator into a gizmo's cached arrays, growing them when the count
 * exceeds capacity, and (re)upload the buffer. Returns the vertex count.
 * @param {WebGL2RenderingContext} gl
 * @param {object} g  A cached gizmo entry.
 * @param {function(object):number} gen  gen(arrays) → vertices needed.
 * @returns {number} Vertices written.
 */
export function fill(gl, g, gen) {
  let n = gen(g.arrays);
  if (n > capacityOf(g.arrays)) { growArrays(g.arrays, n); gen(g.arrays); }
  if (!g.buffer || g.capacity !== capacityOf(g.arrays)) {
    if (g.buffer) for (const a of Object.values(g.buffer.attribs)) gl.deleteBuffer(a.buffer);
    g.buffer = createBufferInfoFromArrays(gl, _arraysOf(g));
    g.capacity = capacityOf(g.arrays);
  } else if (g.arrays.count > 0) {
    setAttribInfoBufferFromArray(gl, g.buffer.attribs.aPosition, g.arrays.position.data);
    if (g.arrays.color) setAttribInfoBufferFromArray(gl, g.buffer.attribs.aColor, g.arrays.color.data);
    if (g.arrays.texcoord) setAttribInfoBufferFromArray(gl, g.buffer.attribs.aTexCoord, g.arrays.texcoord.data);
  }
  return g.arrays.count;
}

const _viewport = (gl) => { const v = gl.getParameter(gl.VIEWPORT); _vp[0] = v[0]; _vp[1] = v[1]; _vp[2] = v[2]; _vp[3] = v[3]; return _vp; };

/** Draw a filled gizmo's lines under M with the pipe program; uColor unless the arrays carry colour. */
function _drawLines(gl, ctx, g, M, color, depth) {
  if (!g.arrays.count) return;
  const prog = lineProgram(gl);
  if (!prog) return;
  const prev = ctx.prog;
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth === false && wasDepth) gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prog.program);
  setBuffersAndAttributes(gl, prog, g.buffer);
  const s = prog.uniformSetters;
  s.uPV(ctx.PV); s.uModel(M || IDENTITY); s.uColor(color || WHITE);
  const useColor = !!g.arrays.color;
  s.uUseColor(useColor);
  if (!useColor && prog.attribSetters.aColor) gl.disableVertexAttribArray(prog.attribSetters.aColor.location);
  drawBufferInfo(gl, g.buffer, gl.LINES, g.arrays.count);
  if (depth === false && wasDepth) gl.enable(gl.DEPTH_TEST);
  if (prev) gl.useProgram(prev.program);
}

/** Draw a filled gizmo's triangles through the flat program under M. */
function _drawTris(gl, ctx, g, M, color, texture, depth) {
  if (!g.arrays.count) return;
  const prog = flatProgram(gl);
  if (!prog) return;
  const prev = ctx.prog;
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth === false && wasDepth) gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prog.program);
  setBuffersAndAttributes(gl, prog, g.buffer);
  const s = prog.uniformSetters;
  s.uModelViewProjectionMatrix(M ? mat4Mul(_M, ctx.PV, M) : ctx.PV);
  s.uColor(color || WHITE);
  s.uUseTexture(!!texture);
  if (texture) s.uTexture(texture);
  drawBufferInfo(gl, g.buffer, gl.TRIANGLES, g.arrays.count);
  if (depth === false && wasDepth) gl.enable(gl.DEPTH_TEST);
  if (prev) gl.useProgram(prev.program);
}

// ── Scene gizmos ─────────────────────────────────────────────────────────

/**
 * A coordinate frame: six half-axes by bit and the X · Y · Z line glyphs
 * with LABELS; semantic colour per axis unless { semantic: false, color }.
 * @param {WebGL2RenderingContext} gl
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, semantic?:boolean, color?:number[], depth?:boolean }} [opts]
 */
export function axes(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'axes', { color: true });
  fill(gl, g, (a) => axesLines(a, o));
  _drawLines(gl, ctx, g, o.M, null, o.depth);
}

/**
 * A grid in the XY plane; M orients it (a ground plane is a rotation about X).
 * @param {WebGL2RenderingContext} gl
 * @param {{ M?:ArrayLike<number>, size?:number, subdivisions?:number, color?:number[], depth?:boolean }} [opts]
 */
export function grid(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'grid');
  fill(gl, g, (a) => gridLines(a, o));
  _drawLines(gl, ctx, g, o.M, o.color, o.depth);
}

/**
 * One cubic Hermite segment as a polyline.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} p0,t0  Start point and outgoing tangent.
 * @param {number[]} p1,t1  End point and incoming tangent.
 * @param {{ M?:ArrayLike<number>, samples?:number, color?:number[], depth?:boolean }} [opts]
 */
export function hermite(gl, p0, t0, p1, t1, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'hermite');
  fill(gl, g, (a) => hermiteLines(a, p0, t0, p1, t1, o));
  _drawLines(gl, ctx, g, o.M, o.color, o.depth);
}

/**
 * A textured or flat quad through the internal flat program: corners p0
 * top-left, then clockwise; default uvs put the top-left at v = 1, so a
 * texture in GL's bottom-up space reads upright. `uvs` maps a sub-rectangle
 * or tiles, four pairs flat in corner order; it never flips.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} p0,p1,p2,p3
 * @param {{ M?:ArrayLike<number>, texture?:WebGLTexture, uvs?:number[], color?:number[], depth?:boolean }} [opts]
 */
export function pane(gl, p0, p1, p2, p3, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'pane', { texcoord: true });
  fill(gl, g, (a) => paneTris(a, p0, p1, p2, p3, o));
  _drawTris(gl, ctx, g, o.M, o.color, o.texture || null, o.depth);
}
