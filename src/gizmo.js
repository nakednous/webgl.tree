/**
 * @file Gizmos — the line pipe over the core generators, HUD mode, panes.
 * @module webgl.tree/gizmo
 * @license AGPL-3.0-only
 *
 * Gizmos drawn by name under the installed camera — frames, grids, curves,
 * frustums, track paths, helm rigs, handles — and screen-space marks between
 * `beginHUD` and `endHUD`. Each takes `gl`, its subject, and options such as
 * `M`, `color`, `bits`, `size` and `depth`.
 *
 * ```
 * axes(gl, opts) · grid(gl, opts) · hermite(gl, p0, t0, p1, t1, opts)
 * viewFrustum(gl, opts) · trackPath(gl, track, opts) · helmRig(gl, helm, opts) · handleLocus(gl, h, opts)
 * pane(gl, p0, p1, p2, p3, opts)                       // a textured or flat quad
 * lines(gl, segments, opts)                            // the caller's own batch, one call
 * beginHUD(gl) · cross(gl, opts) · bullsEye(gl, opts) · endHUD(gl)   // { x, y } in px, y down
 * ```
 *
 * @details
 * The pipe: one internal program per context (aPosition, optional aColor,
 * uPV, uModel, uColor), drawn as gl.LINES. Each gizmo owns one cached
 * bufferInfo per context, allocated from the generator's returned count and
 * grown when it exceeds capacity; per frame the generator writes into the
 * cached arrays and the buffer is re-uploaded — zero allocation once warm.
 * Depth test on by default; { depth: false } for overlays. { width } counts
 * logical pixels, default 1, scaled by the pixel density: at or below one
 * device pixel the native GL line draws, above it each segment expands into
 * a window-space quad of that width through a second internal program, the
 * generators untouched. Colour is semantic where the generator writes a
 * palette (axes, the helm rig), else opts.color (default white). A gizmo
 * binds its own program and restores the one bound before it.
 *
 * `lines` draws the caller's own batch through the same pipe. `helmRig`'s
 * `identify` is the pipe's label seam: the layer takes each anchor to world
 * space, and this bridge wires it to `host.labels`.
 */

'use strict';

import {
  capacityOf,
  axesLines, gridLines, crossLines, bullsEyeLines, frustumLines, frustumCorners, hermiteLines,
  pathLines, helmRigLines, locusLines, paneTris,
  mat4Ortho, mat4Mul, mat4MulPoint, mat4FromTRS, pixelRatio, createCamera, cameraEye, cameraView, cameraProj,
  X, Y, _Z, _X, _Y, Z, NEAR, FAR, BODY, APEX, PATH, HANDLES, HANDLE, AIM, LOCUS, RING, POINT, WEBGL,
} from '@nakednous/tree';
import { helmBasis } from '@nakednous/host';
import {
  NORMAL, beginHUD as beginHUDOf, drawLines as drawLinesOf, drawPane as drawPaneOf,
  endHUD as endHUDOf, expand as expandOf, fill as fillOf, gizmo as gizmoOf,
} from '@nakednous/idiom';
import { contextOf, viewOf } from './context.js';
import { installCamera } from './camera.js';
import { renderTarget } from './target.js';
import { image } from './pass.js';
import { canvasViewport, canvasScale } from './space.js';

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

/**
 * Run a generator into a gizmo's cached arrays, growing them when the count
 * exceeds capacity, and (re)upload the buffer. Returns the vertex count.
 * @param {WebGL2RenderingContext} gl
 * @param {object} g  A cached gizmo entry.
 * @param {function(object):number} gen  gen(arrays) → vertices needed.
 * @returns {number} Vertices written.
 * @ignore
 */
export function fill(gl, g, gen) {
  return fillOf(contextOf(gl), g, gen);
}

/**
 * Expand a gizmo's line list into the wide-line quads (experimental): four
 * vertices per segment carrying both endpoints, which end they sit at and
 * their side, plus the endpoint's colour when the arrays carry one; six
 * indices per segment. Cached beside the raw buffer, grown like it.
 * @param {WebGL2RenderingContext} gl
 * @param {object} g  A cached gizmo entry.
 * @returns {object} The wide cache: { A, B, T, S, color?, indices, buffer, segments }.
 * @ignore
 */
export function expand(gl, g) {
  expandOf(contextOf(gl), g);
  return g.wide;                     // the cache the layer filled, as this verb has always answered
}

/**
 * Draw a filled gizmo's lines under M — the layer's policy, this bridge's density.
 * @details The width is stated in logical pixels and travels as device pixels, so
 * the viewport the quads are expanded against is the pass's, in device pixels —
 * the backend's own. `canvasViewport` is screen space, in logical pixels, and is
 * the HUD's; a wide line measured against it comes out `dpr` times its width.
 */
function _drawLines(gl, ctx, g, M, color, depth, width, identify) {
  return drawLinesOf(ctx, g, { M, color, depth, width, dpr: canvasScale(gl), identify });
}

/**
 * The sink the pipe hands a labelled item to: the host's label layer, a frame
 * label a re-set, the class this bridge's own. One sink a context, so a rig
 * drawn every frame allocates nothing.
 * @ignore
 */
function _sinkOf(ctx) {
  const host = ctx.host;
  if (!host || !host.labels) return null;
  return ctx.labelSink || (ctx.labelSink = (id, text, x, y, z) => {
    host.labels.set(id, text, x, y, z, { frame: true, class: 'helm-rig' });
  });
}

/** Draw a filled gizmo's triangles through the backend's flat program. */
function _drawTris(gl, ctx, g, M, color, texture, depth) {
  return drawPaneOf(ctx, g, { M, color, texture, depth });
}

// ── Scene gizmos ─────────────────────────────────────────────────────────

/**
 * A coordinate frame: six half-axes by bit and the X · Y · Z line glyphs
 * with LABELS; semantic colour per axis unless { semantic: false, color }.
 * The letters read upright under the y-up NDC every projection the bridge
 * installs produces; a hero drawing through a flipped projection passes
 * { ndcYSign: -1 }.
 * @param {WebGL2RenderingContext} gl
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, semantic?:boolean, color?:number[],
 *           ndcYSign?:number, depth?:boolean }} [opts]
 * @example
 * <caption>A frame at the origin, and a second one moved by M to (−150, 0, 0) and turned 45° about Y.</caption>
 * const { createCanvas, setCamera, axes, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const q = tree.qFromAxisAngle(tree.quat(), 0, 1, 0, Math.PI / 4)
 * const M = tree.mat4FromTRS(tree.mat4(), -150, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [97, 143, 229], center: [-75, 0, 0] }))
 * axes(gl, { size: 100 })
 * axes(gl, { M, size: 60 })
 */
export function axes(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'axes', { color: true });
  fill(gl, g, (a) => axesLines(a, o));
  _drawLines(gl, ctx, g, o.M, null, o.depth, o.width);
}

/**
 * A grid in the XY plane; M orients it (a ground plane is a rotation about X).
 * @param {WebGL2RenderingContext} gl
 * @param {{ M?:ArrayLike<number>, size?:number, subdivisions?:number, color?:number[], depth?:boolean }} [opts]
 * @example
 * <caption>A ground grid: the XY grid laid flat by a rotation about X, under the axes.</caption>
 * const { createCanvas, setCamera, axes, grid, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const q = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [164, 136, 218] }))
 * grid(gl, { M: ground, size: 120, subdivisions: 10 })
 * axes(gl, { size: 100 })
 */
export function grid(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'grid');
  fill(gl, g, (a) => gridLines(a, o));
  _drawLines(gl, ctx, g, o.M, o.color, o.depth, o.width);
}

/**
 * One cubic Hermite segment as a polyline.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} p0  Start point.
 * @param {number[]} t0  Outgoing tangent.
 * @param {number[]} p1  End point.
 * @param {number[]} t1  Incoming tangent.
 * @param {{ M?:ArrayLike<number>, samples?:number, color?:number[], depth?:boolean }} [opts]
 * @example
 * <caption>A magenta arch from (−150, 0, 0) to (150, 0, 0): it leaves upward and arrives downward.</caption>
 * const { createCanvas, setCamera, axes, hermite, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [0, 89, 220], center: [0, 40, 0] }))
 * axes(gl, { size: 100 })
 * hermite(gl, [-150, 0, 0], [0, 400, 0], [150, 0, 0], [0, -400, 0], { color: [1, 0.31, 0.85, 1] })
 */
export function hermite(gl, p0, t0, p1, t1, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'hermite');
  fill(gl, g, (a) => hermiteLines(a, p0, t0, p1, t1, o));
  _drawLines(gl, ctx, g, o.M, o.color, o.depth, o.width);
}

/**
 * A quad, textured or flat, from four corners clockwise from the top-left;
 * a texture reads upright. `uvs` maps a sub-rectangle or tiles.
 * @details Drawn through the internal flat program; default uvs put the
 * top-left at v = 1, matching GL's bottom-up texture space. `uvs` is four
 * pairs flat in corner order; it never flips.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} p0  Top-left corner.
 * @param {number[]} p1  Top-right corner.
 * @param {number[]} p2  Bottom-right corner.
 * @param {number[]} p3  Bottom-left corner.
 * @param {{ M?:ArrayLike<number>, texture?:WebGLTexture, uvs?:number[], color?:number[], depth?:boolean }} [opts]
 * @example
 * <caption>A 2D-canvas texture on a quad reads upright: “twgl” on a yellow band at the top.</caption>
 * const { createCanvas, setCamera, texture, pane, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const label = document.createElement('canvas')
 * label.width = 256
 * label.height = 256
 * const g = label.getContext('2d')
 * g.fillStyle = '#ff4fd8'
 * g.fillRect(0, 0, 256, 256)
 * g.fillStyle = '#ffd166'
 * g.fillRect(0, 0, 256, 96)
 * g.fillStyle = '#222'
 * g.font = 'bold 64px sans-serif'
 * g.fillText('twgl', 50, 70)
 * const tex = texture(gl, label)
 *
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [0, 0, 205] }))
 * pane(gl, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 */
export function pane(gl, p0, p1, p2, p3, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'pane', { texcoord: true });
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
 * @example
 * <caption>The frustum of a second camera looking at the origin, with small axes at its eye.</caption>
 * const { createCanvas, setCamera, axes, viewFrustum, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const other = tree.createCamera({ eye: [-150, 80, 150], fov: Math.PI / 4, near: 30, far: 200 })
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [255, 212, 340] }))
 * axes(gl, { size: 60 })
 * viewFrustum(gl, { camera: other })
 */
export function viewFrustum(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  let cam;
  if (o.mat4Eye && o.mat4Proj) { _matCam.mat4Eye = o.mat4Eye; _matCam.mat4Proj = o.mat4Proj; _matCam.ndcZMin = ctx.ndcZMin; cam = _matCam; }
  else if (_isTrack(o.camera)) cam = o.camera.eval(_cam);
  else if (_isState(o.camera)) cam = o.camera;
  else { console.error('[webgl.tree] viewFrustum: needs `camera` (a camera state or a CameraTrack) or `mat4Eye` and `mat4Proj`.'); return; }
  const aspect = _aspect(gl, o);
  const bits = o.bits ?? (NEAR | FAR | BODY);
  // a textured face is drawn first and keeps its outline, as p5's stroked pane does
  if (((bits & FAR) && o.farTexture) || ((bits & NEAR) && o.nearTexture)) {
    if (frustumCorners(_c24, cam, aspect, ctx.ndcZMin)) {
      if ((bits & FAR) && o.farTexture) pane(gl, _corner(_q0, 7), _corner(_q1, 6), _corner(_q2, 5), _corner(_q3, 4), { texture: o.farTexture, depth: o.depth });
      if ((bits & NEAR) && o.nearTexture) pane(gl, _corner(_q0, 3), _corner(_q1, 2), _corner(_q2, 1), _corner(_q3, 0), { texture: o.nearTexture, depth: o.depth });
    }
  }
  const g = gizmoOf(ctx, 'frustum');
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
  const g = gizmoOf(ctx, 'marker');
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
 * @example
 * <caption>A three-keyframe pose track: its path, its control points, and a small frame at each keyframe.</caption>
 * const { createCanvas, setCamera, trackPath, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const track = new tree.PoseTrack()
 * track.add([
 *   { pos: [-150, 0, 0], rot: [0, 0, 0, 1] },
 *   { pos: [0, 100, 50], rot: [0, 0, 0, 1] },
 *   { pos: [150, 0, 0], rot: [0, 0, 0, 1] },
 * ])
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [164, 186, 243], center: [0, 50, 25] }))
 * trackPath(gl, track, { bits: tree.PATH | tree.CONTROLS, color: [1, 0.82, 0.4, 1] })
 */
export function trackPath(gl, track, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!track || !Array.isArray(track.keyframes)) return;
  const bits = o.bits ?? PATH;
  const g = gizmoOf(ctx, 'path');
  fill(gl, g, (a) => pathLines(a, track, { bits: bits & ~HANDLES, samples: o.samples, target: o.target, tangentScale: o.tangentScale, centerSize: o.centerSize, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  const isCamera = typeof track.sampleEye === 'function';
  const marker = 'marker' in o ? o.marker : (isCamera ? (o.target === 'center' ? null : _cameraMarker) : _poseMarker);
  if (typeof marker === 'function') {
    const kfs = track.keyframes;
    for (let i = 0; i < kfs.length; i++) marker(gl, kfs[i], i, track, o);
  }
  if ((bits & HANDLES) && track.handles && track.handles.members) {
    // the dot for every member, the ring for a rot dial; a VIEW member's drag plane is not drawn
    for (const m of track.handles.members) {
      handleLocus(gl, m.h, { bits: m.field === 'rot' ? HANDLE | LOCUS : HANDLE, size: track.handles.grabPx, color: o.color, depth: o.depth });
    }
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
 * With `identify`, each channel's lane goes to the host's label layer: the
 * layer resolves the anchors and their ids, and this bridge wires the sink.
 * @param {WebGL2RenderingContext} gl
 * @param {object} helm  A PoseHelm.
 * @param {{ M?:ArrayLike<number>, size?:number, bits?:number, identify?:boolean, depth?:boolean,
 *           x?:number, y?:number, tilt?:number|number[], tint?:number[] }} [opts]
 * @example
 * <caption>A helm fed a translation rate, then a rotation rate, in turn: first an arrow brightens, then a ring.</caption>
 * const { createCanvas, setCamera, helmRig, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const cam = tree.createCamera({ eye: [123, 103, 165] })
 * const helm = new tree.PoseHelm()
 * const pose = { pos: tree.vec3(), rot: tree.quat() }
 * const lin = tree.vec3()
 * const ang = tree.vec3()
 * let last = 0
 *
 * function frame(ms) {
 *   const s = Math.sin(ms / 1000)
 *   lin[0] = 250 * Math.max(0, s)
 *   ang[1] = 250 * Math.max(0, -s)
 *   helm.feed(lin, ang)
 *   helm.step(pose, Math.min((ms - last) / 1000, 0.05))
 *   last = ms
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   helmRig(gl, helm, { size: 100 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
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
  const g = _rigCache(ctx, helm);
  fill(gl, g, (a) => helmRigLines(a, helm, { size: o.size, bits: o.bits, identify: o.identify === true }));
  _drawLines(gl, ctx, g, M, null, o.depth, o.width, o.identify === true ? _sinkOf(ctx) : null);
}

/**
 * The rig's cache: one a helm, so the lanes' label ids — the cache's name and
 * the label's index — belong to the helm that drew them.
 * @ignore
 */
function _rigCache(ctx, helm) {
  const id = helm._rigId || (helm._rigId = ++_rigSeq);
  return gizmoOf(ctx, 'helmRig' + id, { color: true, labels: true });
}

function _rigHud(gl, ctx, helm, o) {
  // The HUD's coordinates are logical pixels, as beginHUD's ortho is: the rig's own
  // target is that size times the canvas's scale, and the rect it is displayed in is
  // the same. Reading x / y / size as device pixels put the corner rigs at half size
  // and the wrong offset on any display whose drawing buffer is denser than the canvas.
  const s = canvasScale(gl);
  const size = o.size ?? 120;
  const px = Math.max(1, Math.round(size * s));
  let entry = ctx.rigs.get(helm);
  if (!entry || entry.size !== px) {
    if (entry) entry.fbo.dispose();
    entry = { fbo: renderTarget(gl, { width: px, height: px }), size: px };
    ctx.rigs.set(helm, entry);
  }
  let az = _AZ_ISO, el = _EL_ISO;
  if (Array.isArray(o.tilt)) { az = o.tilt[0]; el = o.tilt[1]; } else if (typeof o.tilt === 'number') el = o.tilt;
  const ce = Math.cos(el), se = Math.sin(el);
  _rigCam.eye[0] = _RIG_D * ce * Math.sin(az); _rigCam.eye[1] = _RIG_D * se; _rigCam.eye[2] = _RIG_D * ce * Math.cos(az);

  const vp = ctx.backend.setViewport(ctx);
  const outer = ctx.backend.bindTarget(ctx, entry.fbo);
  const vh = vp[3];
  _V.set(ctx.V); _P2.set(ctx.P);
  const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  cameraView(_E, _rigCam);
  installCamera(ctx, _E, cameraProj(_P, _rigCam, 1, ctx.ndcZMin));
  const g = _rigCache(ctx, helm);
  fill(gl, g, (a) => helmRigLines(a, helm, { size: 100, bits: o.bits }));
  _drawLines(gl, ctx, g, null, null, true, o.width);
  installCamera(ctx, _V, _P2);
  if (!wasDepth) gl.disable(gl.DEPTH_TEST);
  ctx.backend.bindTarget(ctx, outer);
  ctx.backend.setViewport(ctx, vp);
  image(gl, entry.fbo.color, { x: (o.x ?? 0) * s, y: vh - ((o.y ?? 0) + size) * s, width: px, height: px, tint: o.tint, blend: 'NORMAL' });
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
 * @example
 * <caption>Drag the magenta dot: it slides on the ground plane y = 0.</caption>
 * const { createCanvas, init, setCamera, grid, handleLocus, tree, host } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const canvas = gl.canvas
 * const canvasHost = host.createHost(canvas)
 * init(gl, { host: canvasHost })
 *
 * const cam = tree.createCamera({ eye: [164, 136, 218] })
 * const h = canvasHost.handle({ constraint: tree.PLANE, anchor: [0, 0, 0], normal: [0, 1, 0] })
 * const q = tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2)
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   h.update()
 *   grid(gl, { M: ground, size: 120, subdivisions: 10 })
 *   handleLocus(gl, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function handleLocus(gl, h, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!h || !h._constraint) return;
  const bits = o.bits ?? (HANDLE | AIM | LOCUS);
  h.value(_p, { report: POINT });
  const g = gizmoOf(ctx, 'locus');
  fill(gl, g, (a) => locusLines(a, h._constraint, { bits: bits & (AIM | LOCUS | RING), mat4View: ctx.V, point: _p, color: o.color }));
  _drawLines(gl, ctx, g, null, o.color, o.depth, o.width);
  if (bits & HANDLE) {
    const V = ctx.V, height = -canvasViewport(gl)[3] || 1;   // the grab radius counts logical pixels
    const eyeZ = V[2]*_p[0] + V[6]*_p[1] + V[10]*_p[2] + V[14];
    const r = (o.size ?? h._grabPx ?? 12) * pixelRatio(ctx.P, height, eyeZ, ctx.ndcZMin);
    _du[0] = V[0]; _du[1] = V[4]; _du[2] = V[8];      // the camera's right
    _dv[0] = V[1]; _dv[1] = V[5]; _dv[2] = V[9];      // the camera's up
    const d = gizmoOf(ctx, 'dot');
    fill(gl, d, (a) => _disc(a, _p[0], _p[1], _p[2], r, _du, _dv));
    _drawTris(gl, ctx, d, null, o.dotColor || o.color, null, o.depth);
  }
}

// ── The caller's own lines ──────────────────────────────────────────────

/**
 * Write `n` segments of ten numbers into a cache's arrays, and answer the
 * vertices `fill` wants.
 * @ignore
 */
function _writeSegments(a, segments, n) {
  const pos = a.position.data, col = a.color.data;
  const m = Math.min(n, (pos.length / 6) | 0);          // a segment is two vertices
  for (let i = 0; i < m; i++) {
    const s = 10 * i, p = 6 * i, c = 8 * i;
    pos[p] = segments[s]; pos[p + 1] = segments[s + 1]; pos[p + 2] = segments[s + 2];
    pos[p + 3] = segments[s + 3]; pos[p + 4] = segments[s + 4]; pos[p + 5] = segments[s + 5];
    col[c] = col[c + 4] = segments[s + 6];
    col[c + 1] = col[c + 5] = segments[s + 7];
    col[c + 2] = col[c + 6] = segments[s + 8];
    col[c + 3] = col[c + 7] = segments[s + 9];
  }
  a.count = 2 * m;
  return 2 * n;
}

/**
 * A batch of coloured segments — the caller's own geometry, rebuilt a frame —
 * drawn in one call under `opts.M`: ten numbers a segment, its two endpoints
 * and its colour.
 * @details One cache a context: the geometry is rebuilt when the batch outgrows
 * it and written in place otherwise, so a figure that rewrites one array a frame
 * allocates nothing. `width` counts logical pixels — the bridge's density carries
 * it to device pixels, and above one each segment expands into a quad. The
 * colour's alpha blends; the blend and depth state the call found are restored.
 * @param {WebGL2RenderingContext} gl
 * @param {ArrayLike<number>} segments  The batch: `x0 y0 z0 x1 y1 z1 r g b a` a segment.
 * @param {{ count?:number, M?:ArrayLike<number>, width?:number, depth?:boolean }} [opts]
 *        `count` segments are drawn; the array's own length is the default.
 * @example
 * <caption>A ring rebuilt every frame into the same array, drawn in one call a frame — at a width of three logical pixels, so each segment is a quad.</caption>
 * const { createCanvas, setCamera, lines, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const cam = tree.createCamera({ eye: [164, 186, 243] })
 * const N = 64
 * const batch = new Float32Array(10 * N)
 *
 * function frame() {
 *   for (let i = 0; i < N; i++) {
 *     const a = 2 * Math.PI * i / N, b = 2 * Math.PI * (i + 1) / N, o = 10 * i
 *     batch[o] = 100 * Math.cos(a); batch[o + 1] = 100 * Math.sin(a); batch[o + 2] = 0
 *     batch[o + 3] = 100 * Math.cos(b); batch[o + 4] = 100 * Math.sin(b); batch[o + 5] = 0
 *     batch[o + 6] = 1; batch[o + 7] = 0.82; batch[o + 8] = 0.4; batch[o + 9] = 1
 *   }
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   lines(gl, batch, { width: 3 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function lines(gl, segments, opts) {
  const ctx = contextOf(gl), o = opts || {};
  if (!segments) return;
  const n = o.count === undefined ? ((segments.length / 10) | 0) : Math.max(0, o.count | 0);
  const g = gizmoOf(ctx, 'lines', { color: true });
  fill(gl, g, (a) => _writeSegments(a, segments, n));
  const prior = ctx.backend.setState(ctx, { blend: NORMAL });
  try {
    _drawLines(gl, ctx, g, o.M, null, o.depth, o.width);
  } finally {
    ctx.backend.setState(ctx, prior);
  }
}

// ── HUD ─────────────────────────────────────────────────────────────────

/**
 * Start drawing in screen space: the installed camera is saved, an
 * orthographic projection over the current viewport in logical pixels, y
 * down, with an identity view goes in, and the depth test goes off. Pair
 * with endHUD. The screen-space gizmos and image are the usual contents.
 * @param {WebGL2RenderingContext} gl
 * @example
 * <caption>Between beginHUD and endHUD, coordinates are logical pixels: a crosshair near the top-left corner, a bulls-eye near the bottom-right.</caption>
 * const { createCanvas, setCamera, axes, beginHUD, endHUD, cross, bullsEye, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(gl, { size: 100 })
 * beginHUD(gl)
 * cross(gl, { x: 40, y: 40, size: 30, color: [1, 0.31, 0.85, 1] })
 * bullsEye(gl, { x: 350, y: 250, size: 50, color: [1, 0.82, 0.4, 1] })
 * endHUD(gl)
 */
export function beginHUD(gl) {
  return beginHUDOf(contextOf(gl), { vp: canvasViewport(gl) });
}

/**
 * End HUD mode: the camera and the depth test come back.
 * @param {WebGL2RenderingContext} gl
 * @example
 * <caption>After endHUD the camera is back: axes drawn after it sit in the scene, over a yellow HUD bulls-eye at the centre.</caption>
 * const { createCanvas, setCamera, axes, beginHUD, endHUD, bullsEye, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * beginHUD(gl)
 * bullsEye(gl, { x: 200, y: 150, size: 120, color: [1, 0.82, 0.4, 1] })
 * endHUD(gl)
 * axes(gl, { size: 100 })
 */
export function endHUD(gl) {
  return endHUDOf(contextOf(gl));
}

/** Run a HUD gizmo inside beginHUD / endHUD unless HUD mode is already on. */
function _inHud(gl, ctx, draw) {
  const wrap = !ctx.hud;
  if (wrap) beginHUDOf(ctx, { vp: canvasViewport(gl) });
  try { draw(); } finally { if (wrap) endHUDOf(ctx); }
}

/**
 * A crosshair at (x, y) in target pixels, y down.
 * @param {WebGL2RenderingContext} gl
 * @param {{ x?:number, y?:number, size?:number, color?:number[] }} [opts]
 * @example
 * <caption>A magenta crosshair at the canvas centre, over the origin the camera looks at.</caption>
 * const { createCanvas, setCamera, axes, cross, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(gl, { size: 100 })
 * cross(gl, { x: 200, y: 150, size: 40, color: [1, 0.31, 0.85, 1] })
 */
export function cross(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'cross');
  fill(gl, g, (a) => crossLines(a, o));
  _inHud(gl, ctx, () => _drawLines(gl, ctx, g, null, o.color, false, o.width));
}

/**
 * A bulls-eye at (x, y) in target pixels, y down: a circle (CIRCLE) or the
 * cornered square (SQUARE) of `size`, with the central cross.
 * @param {WebGL2RenderingContext} gl
 * @param {{ x?:number, y?:number, size?:number, shape?:number, detail?:number, color?:number[] }} [opts]
 * @example
 * <caption>A round bulls-eye on the left, a cornered square one on the right.</caption>
 * const { createCanvas, bullsEye, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT)
 * bullsEye(gl, { x: 120, y: 150, size: 100, shape: tree.CIRCLE, color: [1, 0.31, 0.85, 1] })
 * bullsEye(gl, { x: 280, y: 150, size: 100, shape: tree.SQUARE, color: [1, 0.82, 0.4, 1] })
 */
export function bullsEye(gl, opts) {
  const ctx = contextOf(gl), o = opts || {};
  const g = gizmoOf(ctx, 'bullsEye');
  fill(gl, g, (a) => bullsEyeLines(a, o));
  _inHud(gl, ctx, () => _drawLines(gl, ctx, g, null, o.color, false, o.width));
}
