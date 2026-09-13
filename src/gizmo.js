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
 * lines by default; { width } in pixels (experimental) expands each segment
 * into a screen-space quad through a second internal program, the
 * generators untouched. Colour is semantic where the generator writes a
 * palette (axes, the helm rig), else opts.color (default white). A gizmo
 * binds its own program and restores the one bound before it.
 */

'use strict';

import {
  createArrays, growArrays, capacityOf,
  axesLines, gridLines, crossLines, bullsEyeLines, frustumLines, frustumCorners, hermiteLines,
  pathLines, helmRigLines, locusLines, paneTris,
  mat4Ortho, mat4Mul, mat4MulPoint, mat4FromTRS, pixelRatio, createCamera, cameraEye, cameraView, cameraProj,
  X, Y, _Z, _X, _Y, Z, NEAR, FAR, BODY, APEX, PATH, HANDLES, HANDLE, AIM, LOCUS, RING, POINT, WEBGL,
} from '@nakednous/tree';
import { helmBasis } from '@nakednous/host';
import { createBufferInfoFromArrays, setAttribInfoBufferFromArray, setBuffersAndAttributes, drawBufferInfo, bindFramebufferInfo } from 'twgl.js';
import { contextOf, viewOf } from './context.js';
import { installCamera } from './camera.js';
import { renderTarget } from './target.js';
import { image } from './pass.js';
import { lineProgram, wideLineProgram, flatProgram } from './programs.js';

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
    g = { arrays: createArrays(64, opts), buffer: null, capacity: 0, wide: null };
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

/**
 * Expand a gizmo's line list into the wide-line quads (experimental): four
 * vertices per segment carrying both endpoints, which end they sit at and
 * their side, plus the endpoint's colour when the arrays carry one; six
 * indices per segment. Cached beside the raw buffer, grown like it.
 * @param {WebGL2RenderingContext} gl
 * @param {object} g  A cached gizmo entry.
 * @returns {object} The wide cache: { A, B, T, S, color?, indices, buffer, segments }.
 */
export function expand(gl, g) {
  const segs = (g.arrays.count / 2) | 0;
  let w = g.wide;
  if (!w || w.capacity < segs) {
    const cap = Math.max(segs, w ? w.capacity * 2 : 16);
    w = {
      A: new Float32Array(12 * cap), B: new Float32Array(12 * cap), T: new Float32Array(4 * cap), S: new Float32Array(4 * cap),
      color: g.arrays.color ? new Float32Array(16 * cap) : null, indices: new Uint32Array(6 * cap),
      buffer: null, capacity: cap, segments: 0,
    };
    for (let i = 0; i < cap; i++) {
      const v = 4 * i;
      w.T[v] = 0; w.T[v + 1] = 0; w.T[v + 2] = 1; w.T[v + 3] = 1;
      w.S[v] = -1; w.S[v + 1] = 1; w.S[v + 2] = -1; w.S[v + 3] = 1;
      const k = 6 * i;
      w.indices[k] = v; w.indices[k + 1] = v + 1; w.indices[k + 2] = v + 2;
      w.indices[k + 3] = v + 1; w.indices[k + 4] = v + 3; w.indices[k + 5] = v + 2;
    }
    if (g.wide && g.wide.buffer) for (const a of Object.values(g.wide.buffer.attribs)) gl.deleteBuffer(a.buffer);
    g.wide = w;
  }
  const p = g.arrays.position.data, c = g.arrays.color ? g.arrays.color.data : null;
  for (let i = 0; i < segs; i++) {
    const a = 6 * i, b = a + 3;
    for (let v = 0; v < 4; v++) {
      const o = 12 * i + 3 * v;
      w.A[o] = p[a]; w.A[o + 1] = p[a + 1]; w.A[o + 2] = p[a + 2];
      w.B[o] = p[b]; w.B[o + 1] = p[b + 1]; w.B[o + 2] = p[b + 2];
      if (c) {
        const src = v < 2 ? 4 * (2 * i) : 4 * (2 * i + 1), dst = 16 * i + 4 * v;
        w.color[dst] = c[src]; w.color[dst + 1] = c[src + 1]; w.color[dst + 2] = c[src + 2]; w.color[dst + 3] = c[src + 3];
      }
    }
  }
  w.segments = segs;
  if (!w.buffer) {
    const arrays = { aA: { numComponents: 3, data: w.A }, aB: { numComponents: 3, data: w.B }, aT: { numComponents: 1, data: w.T }, aSide: { numComponents: 1, data: w.S }, indices: { numComponents: 3, data: w.indices } };
    if (w.color) arrays.aColor = { numComponents: 4, data: w.color };
    w.buffer = createBufferInfoFromArrays(gl, arrays);
  } else if (segs > 0) {
    setAttribInfoBufferFromArray(gl, w.buffer.attribs.aA, w.A);
    setAttribInfoBufferFromArray(gl, w.buffer.attribs.aB, w.B);
    if (w.color) setAttribInfoBufferFromArray(gl, w.buffer.attribs.aColor, w.color);
  }
  return w;
}

/** Draw a filled gizmo's lines under M: raw gl.LINES, or the expanded quads when width > 1; uColor unless the arrays carry colour. */
function _drawLines(gl, ctx, g, M, color, depth, width) {
  if (!g.arrays.count) return;
  const wide = typeof width === 'number' && width > 1;
  const prog = wide ? wideLineProgram(gl) : lineProgram(gl);
  if (!prog) return;
  const prev = ctx.prog;
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  if (depth === false && wasDepth) gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prog.program);
  const s = prog.uniformSetters;
  s.uPV(ctx.PV); s.uModel(M || IDENTITY); s.uColor(color || WHITE);
  const useColor = !!g.arrays.color;
  s.uUseColor(useColor);
  if (!useColor && prog.attribSetters.aColor) gl.disableVertexAttribArray(prog.attribSetters.aColor.location);
  if (wide) {
    const w = expand(gl, g);
    const vp = _viewport(gl);
    _res2[0] = vp[2]; _res2[1] = vp[3];
    s.uViewport(_res2); s.uWidth(width);
    setBuffersAndAttributes(gl, prog, w.buffer);
    drawBufferInfo(gl, w.buffer, gl.TRIANGLES, 6 * w.segments);
  } else {
    setBuffersAndAttributes(gl, prog, g.buffer);
    drawBufferInfo(gl, g.buffer, gl.LINES, g.arrays.count);
  }
  if (depth === false && wasDepth) gl.enable(gl.DEPTH_TEST);
  if (prev) gl.useProgram(prev.program);
}
const _res2 = [0, 0];

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
  else { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); }   // never sample the current target by accident

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
  _drawLines(gl, ctx, g, o.M, null, o.depth, o.width);
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
  _drawLines(gl, ctx, g, o.M, o.color, o.depth, o.width);
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
  _drawLines(gl, ctx, g, o.M, o.color, o.depth, o.width);
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

// ── Frustum, path, rig, locus ─────────────────────────────────────────────

const _E = new Float32Array(16);      // a viewer's eye matrix
const _Mk = new Float32Array(16);     // a marker's model matrix
const _q0 = [0, 0, 0], _q1 = [0, 0, 0], _q2 = [0, 0, 0], _q3 = [0, 0, 0];   // a face's corners
const _matCam = { mat4Eye: null, mat4Proj: null, ndcZMin: WEBGL };
const _isTrack = (c) => !!(c && typeof c.eval === 'function' && typeof c.sampleEye === 'function');
const _isState = (c) => !!(c && c.eye && c.center && c.up);
const _corner = (out, i) => { out[0] = _c24[3*i]; out[1] = _c24[3*i + 1]; out[2] = _c24[3*i + 2]; return out; };
const _aspect = (gl, o) => (o && typeof o.aspect === 'number') ? o.aspect : (gl.drawingBufferHeight ? gl.drawingBufferWidth / gl.drawingBufferHeight : 1);

/**
 * A camera's frustum: NEAR and FAR rectangles, BODY edges, APEX lines
 * (perspective only); a small axes at the eye unless { viewer: null } (a
 * function draws its own, viewer(gl, E)); nearTexture / farTexture draw
 * those faces as panes instead of outlines.
 * @param {WebGL2RenderingContext} gl
 * @param {{ camera?:object, mat4Eye?:ArrayLike<number>, mat4Proj?:ArrayLike<number>, bits?:number,
 *           viewer?:function|null, nearTexture?:WebGLTexture, farTexture?:WebGLTexture, aspect?:number,
 *           color?:number[], depth?:boolean }} [opts]
 *        camera: a camera state, a CameraTrack (its cursor), or the matrix pair.
 */
export function viewFrustum(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  let cam;
  if (o.mat4Eye && o.mat4Proj) { _matCam.mat4Eye = o.mat4Eye; _matCam.mat4Proj = o.mat4Proj; _matCam.ndcZMin = ctx.ndcZMin; cam = _matCam; }
  else if (_isTrack(o.camera)) cam = o.camera.eval(_cam);
  else if (_isState(o.camera)) cam = o.camera;
  else { console.error('[twgl.tree] viewFrustum: needs `camera` (a camera state or a CameraTrack) or `mat4Eye` and `mat4Proj`.'); return; }
  const aspect = _aspect(gl, o);
  const bits = o.bits ?? (NEAR | FAR | BODY);
  // a textured face is drawn first and keeps its outline, as p5's stroked pane does
  if (((bits & FAR) && o.farTexture) || ((bits & NEAR) && o.nearTexture)) {
    if (frustumCorners(_c24, cam, aspect, ctx.ndcZMin)) {
      if ((bits & FAR) && o.farTexture) pane(gl, _corner(_q0, 7), _corner(_q1, 6), _corner(_q2, 5), _corner(_q3, 4), { texture: o.farTexture, depth: o.depth });
      if ((bits & NEAR) && o.nearTexture) pane(gl, _corner(_q0, 3), _corner(_q1, 2), _corner(_q2, 1), _corner(_q3, 0), { texture: o.nearTexture, depth: o.depth });
    }
  }
  const g = _keyed(ctx, 'frustum');
  fill(gl, g, (a) => frustumLines(a, cam, { aspect, ndcZMin: ctx.ndcZMin, bits, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  if (o.viewer === null) return;
  const E = cam === _matCam ? cam.mat4Eye : cameraEye(_E, cam);
  if (typeof o.viewer === 'function') o.viewer(gl, E);
  else axes(gl, { M: E, size: 50, bits: X | Y | _Z, depth: o.depth });
}

/** The default marker of a pose track: a six-axis frame at the keyframe's pose. */
function _poseMarker(gl, kf, i, track, o) {
  const q = kf.rot;
  axes(gl, { M: mat4FromTRS(_Mk, kf.pos[0], kf.pos[1], kf.pos[2], q[0], q[1], q[2], q[3], 1, 1, 1), size: 30, bits: X | _X | Y | _Y | Z | _Z, depth: o.depth });
}

/** The default marker of a camera track: a triad the size of near, the apex lines and the near rectangle, at the keyframe's real lens. */
function _cameraMarker(gl, kf, i, track, o) {
  const ctx = contextOf(gl);
  const g = _keyed(ctx, 'marker');
  fill(gl, g, (a) => frustumLines(a, kf, { aspect: _aspect(gl, o), ndcZMin: ctx.ndcZMin, bits: NEAR | APEX, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  axes(gl, { M: track.mat4Eye(_E, i, 0), size: typeof kf.near === 'number' ? kf.near : 0.1, bits: X | Y | _Z, depth: o.depth });
}

/**
 * A track's path by bit: PATH the sampled polyline, CONTROLS, TANGENTS_IN /
 * TANGENTS_OUT, CENTER (camera tracks); a marker per keyframe (default a
 * small frame, or a camera at its lens; `marker: null` omits, a function
 * marker(gl, kf, i, track) draws its own); HANDLES draws each member of
 * `track.handles` through handleLocus.
 * @param {WebGL2RenderingContext} gl
 * @param {object} track  A PoseTrack or CameraTrack.
 * @param {{ bits?:number, samples?:number, target?:string, tangentScale?:number, centerSize?:number,
 *           marker?:function|null, aspect?:number, color?:number[], depth?:boolean }} [opts]
 */
export function trackPath(gl, track, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!track || !Array.isArray(track.keyframes)) return;
  const bits = o.bits ?? PATH;
  const g = _keyed(ctx, 'path');
  fill(gl, g, (a) => pathLines(a, track, { bits: bits & ~HANDLES, samples: o.samples, target: o.target, tangentScale: o.tangentScale, centerSize: o.centerSize, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  const isCamera = typeof track.sampleEye === 'function';
  const marker = 'marker' in o ? o.marker : (isCamera ? (o.target === 'center' ? null : _cameraMarker) : _poseMarker);
  if (typeof marker === 'function') {
    const kfs = track.keyframes;
    for (let i = 0; i < kfs.length; i++) marker(gl, kfs[i], i, track, o);
  }
  if ((bits & HANDLES) && track.handles && track.handles.members) {
    for (const m of track.handles.members) handleLocus(gl, m.h, { size: track.handles.grabPx, color: o.color, depth: o.depth });
  }
}

const _AZ_ISO = Math.PI / 4, _EL_ISO = Math.atan(1 / Math.SQRT2), _RIG_D = 240;
let _rigSeq = 0;

/**
 * A helm's control rig: three translation arrows and three rotation rings,
 * the driven channel bright. In the scene at M, oriented to the helm's
 * resolved `from`; { x, y, size, tilt } renders it into a small cached
 * target through its own orthographic camera and composites it at (x, y)
 * in HUD pixels (y down) with `tint` — the corner readout of a camera fly.
 * With `identify`, each channel's lane goes to the host's labels.
 * @param {WebGL2RenderingContext} gl
 * @param {object} helm  A PoseHelm.
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, identify?:boolean, depth?:boolean,
 *           x?:number, y?:number, tilt?:number|number[], tint?:number[] }} [opts]
 */
export function helmRig(gl, helm, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!helm) return;
  if (o.x != null && o.y != null) { _rigHud(gl, ctx, helm, o); return; }
  const basis = helmBasis(helm, viewOf(gl), _R);
  let M = o.M || null;
  if (basis) {
    for (let i = 0; i < 12; i++) _R[i] = basis[i];
    _R[12] = _R[13] = _R[14] = 0; _R[15] = 1;
    M = M ? mat4Mul(_M, M, _R) : _R;
  }
  const g = _keyed(ctx, 'helmRig', { color: true, labels: true });
  fill(gl, g, (a) => helmRigLines(a, helm, { size: o.size, bits: o.bits, identify: o.identify === true }));
  _drawLines(gl, ctx, g, M, null, o.depth, o.width);
  const host = ctx.host;
  if (o.identify === true && host && g.arrays.labels.length) {
    const id = helm._rigId || (helm._rigId = ++_rigSeq);
    g.arrays.labels.forEach((l, i) => {
      if (M) mat4MulPoint(_p, M, l.x, l.y, l.z); else { _p[0] = l.x; _p[1] = l.y; _p[2] = l.z; }
      host.labels.set('helmRig' + id + ':' + i, l.text, _p[0], _p[1], _p[2], { frame: true, class: 'helm-rig' });
    });
  }
}

function _rigHud(gl, ctx, helm, o) {
  const size = o.size ?? 120;
  let entry = ctx.rigs.get(helm);
  if (!entry || entry.size !== size) {
    if (entry) entry.fbo.dispose();
    entry = { fbo: renderTarget(gl, { width: size, height: size }), size };
    ctx.rigs.set(helm, entry);
  }
  let az = _AZ_ISO, el = _EL_ISO;
  if (Array.isArray(o.tilt)) { az = o.tilt[0]; el = o.tilt[1]; } else if (typeof o.tilt === 'number') el = o.tilt;
  const ce = Math.cos(el), se = Math.sin(el);
  _rigCam.eye[0] = _RIG_D * ce * Math.sin(az); _rigCam.eye[1] = _RIG_D * se; _rigCam.eye[2] = _RIG_D * ce * Math.cos(az);

  const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const vp = _viewport(gl);
  const vx = vp[0], vy = vp[1], vw = vp[2], vh = vp[3];
  _V.set(ctx.V); _P2.set(ctx.P);
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  bindFramebufferInfo(gl, entry.fbo);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  cameraView(_E, _rigCam);
  installCamera(ctx, _E, cameraProj(_P, _rigCam, 1, ctx.ndcZMin));
  const g = _keyed(ctx, 'helmRig', { color: true, labels: true });
  fill(gl, g, (a) => helmRigLines(a, helm, { size: 100, bits: o.bits }));
  _drawLines(gl, ctx, g, null, null, true, o.width);
  installCamera(ctx, _V, _P2);
  if (!wasDepth) gl.disable(gl.DEPTH_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
  gl.viewport(vx, vy, vw, vh);
  image(gl, entry.fbo.color, { x: o.x, y: vh - o.y - size, width: size, height: size, tint: o.tint, blend: 'NORMAL' });
}

const _DOT_N = 24;
function _disc(a, cx, cy, cz, r, u, v) {
  const need = 3 * _DOT_N;
  const cap = capacityOf(a);
  const p = a.position.data;
  let n = 0;
  for (let i = 0; i < _DOT_N && n + 3 <= cap; i++) {
    const t0 = (i / _DOT_N) * Math.PI * 2, t1 = ((i + 1) / _DOT_N) * Math.PI * 2;
    const c0 = Math.cos(t0) * r, s0 = Math.sin(t0) * r, c1 = Math.cos(t1) * r, s1 = Math.sin(t1) * r;
    const k = 3 * n;
    p[k] = cx; p[k + 1] = cy; p[k + 2] = cz;
    p[k + 3] = cx + c0*u[0] + s0*v[0]; p[k + 4] = cy + c0*u[1] + s0*v[1]; p[k + 5] = cz + c0*u[2] + s0*v[2];
    p[k + 6] = cx + c1*u[0] + s1*v[0]; p[k + 7] = cy + c1*u[1] + s1*v[1]; p[k + 8] = cz + c1*u[2] + s1*v[2];
    n += 3;
  }
  a.count = n;
  return need;
}
const _du = [0, 0, 0], _dv = [0, 0, 0];

/**
 * A handle's visuals: the dot at its point (constant pixel size), the AIM
 * line from the anchor, the LOCUS of its constraint, the RING; bits select,
 * `size` is the dot radius in pixels (default the handle's grabPx).
 * @param {WebGL2RenderingContext} gl
 * @param {object} h  A host Handle.
 * @param {{ bits?:number, size?:number, color?:number[], dotColor?:number[], depth?:boolean }} [opts]
 */
export function handleLocus(gl, h, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!h || !h._constraint) return;
  const bits = o.bits ?? (HANDLE | AIM | LOCUS);
  h.value(_p, { report: POINT });
  const g = _keyed(ctx, 'locus');
  fill(gl, g, (a) => locusLines(a, h._constraint, { bits: bits & (AIM | LOCUS | RING), mat4View: ctx.V, point: _p, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  if (bits & HANDLE) {
    const V = ctx.V, vp = _viewport(gl);
    const eyeZ = V[2]*_p[0] + V[6]*_p[1] + V[10]*_p[2] + V[14];
    const r = (o.size ?? h._grabPx ?? 12) * pixelRatio(ctx.P, vp[3] || 1, eyeZ, ctx.ndcZMin);
    _du[0] = V[0]; _du[1] = V[4]; _du[2] = V[8];      // the camera's right
    _dv[0] = V[1]; _dv[1] = V[5]; _dv[2] = V[9];      // the camera's up
    const d = _keyed(ctx, 'dot');
    fill(gl, d, (a) => _disc(a, _p[0], _p[1], _p[2], r, _du, _dv));
    _drawTris(gl, ctx, d, null, o.dotColor || o.color, null, o.depth);
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────

/**
 * Start drawing in screen space: the installed camera is saved, an
 * orthographic projection over the current viewport in y-down target
 * pixels with an identity view goes in, and the depth test goes off. Pair
 * with endHUD. The screen-space gizmos and image are the usual contents.
 * @param {WebGL2RenderingContext} gl
 */
export function beginHUD(gl) {
  const ctx = contextOf(gl);
  if (ctx.hud) return;
  const vp = _viewport(gl);
  ctx.hud = { V: new Float32Array(ctx.V), P: new Float32Array(ctx.P), depth: gl.isEnabled(gl.DEPTH_TEST) };
  if (ctx.hud.depth) gl.disable(gl.DEPTH_TEST);
  installCamera(ctx, IDENTITY, mat4Ortho(_P, 0, vp[2], vp[3], 0, -1, 1, ctx.ndcZMin));
}

/**
 * End HUD mode: the camera and the depth test come back.
 * @param {WebGL2RenderingContext} gl
 */
export function endHUD(gl) {
  const ctx = contextOf(gl);
  if (!ctx.hud) return;
  installCamera(ctx, ctx.hud.V, ctx.hud.P);
  if (ctx.hud.depth) gl.enable(gl.DEPTH_TEST);
  ctx.hud = null;
}

/** Run a HUD gizmo inside beginHUD / endHUD unless HUD mode is already on. */
function _inHud(gl, ctx, draw) {
  const wrap = !ctx.hud;
  if (wrap) beginHUD(gl);
  draw();
  if (wrap) endHUD(gl);
}

/**
 * A crosshair at (x, y) in target pixels, y down. World anchoring is the
 * sketch's mapLocation.
 * @param {WebGL2RenderingContext} gl
 * @param {{ x?:number, y?:number, size?:number, color?:number[] }} [opts]
 */
export function cross(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'cross');
  fill(gl, g, (a) => crossLines(a, o));
  _inHud(gl, ctx, () => _drawLines(gl, ctx, g, null, o.color, false, o.width));
}

/**
 * A bulls-eye at (x, y) in target pixels, y down: a circle (CIRCLE) or the
 * cornered square (SQUARE) of `size`, with the central cross.
 * @param {WebGL2RenderingContext} gl
 * @param {{ x?:number, y?:number, size?:number, shape?:number, detail?:number, color?:number[] }} [opts]
 */
export function bullsEye(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = _keyed(ctx, 'bullsEye');
  fill(gl, g, (a) => bullsEyeLines(a, o));
  _inHud(gl, ctx, () => _drawLines(gl, ctx, g, null, o.color, false, o.width));
}
