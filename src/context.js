/**
 * @file The per-context registry — one entry per WebGL2 context, keyed by gl.
 * @module webgl.tree/context
 * @license AGPL-3.0-only
 *
 * Every call takes `gl` first; nothing needs setting up before it. `init`
 * attaches a host to a context, `dispose` frees what webgl.tree made for it.
 *
 * ```
 * init(gl, { host })   // optional: attach a host
 * dispose(gl)          // free every GPU resource made here
 * ```
 *
 * @details
 * Every bridge call takes gl first and finds its state here: the installed
 * camera (V, P, PV and the per-draw scratch), the view bag a host-less
 * application reads, the bound program, the cached fullscreen geometry, the
 * internal programs, the pipe caches and the targets to release. The entry is
 * created lazily on first use and released by dispose(gl). A host attached at init (or passed per call as { host }) is where setCamera
 * writes the view bag and where gizmo label anchors go. Without one the
 * bridge keeps its own view bag, reachable through viewOf(gl).
 */

'use strict';

import { WEBGL } from '@nakednous/tree';
import { createView } from '@nakednous/host';

const _registry = new WeakMap();

const _identity = (m) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };

/**
 * Attach a host to a context, so handles, labels and the orbit see the
 * camera `setCamera` installs.
 * @param {WebGL2RenderingContext} gl
 * @param {{ host?:object, raf?:function }} [opts]
 *        host: the @nakednous/host context of the canvas. raf: the readback
 *        poll's requestAnimationFrame (default the window's).
 * @returns {object} The entry.
 * @example
 * <caption>With a host attached, drag the magenta dot around a sphere of radius 100.</caption>
 * const { init, setCamera, axes, handleLocus, tree, host } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const canvasHost = host.createHost(canvas)
 * init(gl, { host: canvasHost })
 *
 * const cam = tree.createCamera({ eye: [129, 107, 172] })
 * const h = canvasHost.handle({ constraint: tree.SPHERE, anchor: [0, 0, 0], radius: 100 })
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   h.update()
 *   axes(gl, { size: 100 })
 *   handleLocus(gl, h, { dotColor: [1, 0.31, 0.85, 1] })
 *   canvasHost.pointer.flush()
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function init(gl, opts) {
  const ctx = contextOf(gl, opts);
  const o = opts || {};
  if (o.host !== undefined) ctx.host = o.host || null;
  if (o.ndcZMin != null) { ctx.ndcZMin = o.ndcZMin; ctx.view.ndcZMin = o.ndcZMin; }
  if (o.raf) ctx.raf = o.raf;
  return ctx;
}

/**
 * The entry of a context, created on first use.
 * @param {WebGL2RenderingContext} gl
 * @returns {object}
 * @ignore
 */
export function contextOf(gl, opts) {
  let ctx = _registry.get(gl);
  if (ctx) return ctx;
  ctx = {
    gl,
    host: null,
    ndcZMin: WEBGL,
    V: _identity(new Float32Array(16)),
    P: _identity(new Float32Array(16)),
    PV: _identity(new Float32Array(16)),
    MV: new Float32Array(16),          // per-draw scratch
    MVP: new Float32Array(16),
    N: new Float32Array(9),
    view: createView({ ndcZMin: WEBGL }),   // the host-less view bag
    prog: null,                        // the program bind() installed
    declared: new WeakMap(),           // programInfo → which transforms it declares
    programs: {},                      // the internal programs, compiled lazily
    quad: null,                        // the fullscreen geometry
    sizes: new WeakMap(),              // texture → [width, height], for uTexelSize
    pipes: {},                         // key → { ping, pong }
    targets: new Set(),                // every renderTarget made here
    gizmos: {},                        // name → { arrays, buffer, capacity, wide }, the line pipe's caches
    rigs: new WeakMap(),               // helm → { fbo, size }, the rig HUD overload's targets
    hud: null,                         // the camera saved by beginHUD, while active
    pickTarget: null,                  // pick's cached 1×1 target
    readbacks: null,                   // { list, pool, polling }, readPixel's pending fences and PBOs
    textures: null,                    // every texture made here
    raf: (opts && opts.raf) || null,   // the readback poll's requestAnimationFrame, overridable
  };
  _registry.set(gl, ctx);
  return ctx;
}

/**
 * The view of a context — the matrices `setCamera` installed, the host's
 * when one is attached.
 * @param {WebGL2RenderingContext} gl
 * @returns {object}
 * @example
 * <caption>A magenta crosshair pinned to the tip of the X axis as the camera circles.</caption>
 * const { setCamera, axes, cross, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const cam = tree.createCamera({ eye: [0, 107, 215] })
 * const tip = tree.vec3()
 * const W = tree.mat4Viewport(tree.mat4(), [0, 300, 400, -300])   // y down, as cross takes it
 * const WPV = tree.mat4()
 *
 * function frame(ms) {
 *   cam.eye[0] = 215 * Math.sin(ms / 1000)
 *   cam.eye[2] = 215 * Math.cos(ms / 1000)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { size: 100 })
 *   // WORLD → SCREEN
 *   tree.mat4Mul(WPV, W, viewOf(gl).mat4PV)
 *   tree.mat4MulPoint(tip, WPV, 100, 0, 0)
 *   cross(gl, { x: tip[0], y: tip[1], size: 30, color: [1, 0.31, 0.85, 1] })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function viewOf(gl) {
  const ctx = contextOf(gl);
  return ctx.host ? ctx.host.view : ctx.view;
}

/**
 * Free every GPU resource webgl.tree made for a context; your own programs
 * and buffers are untouched.
 * @details Targets, the pipe caches, textures, pending readbacks, the
 * internal programs and the fullscreen geometry go, then the entry.
 * @param {WebGL2RenderingContext} gl
 * @example
 * <caption>Click to tear down: the loop stops, dispose frees the target and caches, the context is lost and the canvas goes; click again for a fresh canvas.</caption>
 * const { setCamera, axes, renderTarget, image, dispose, SCREEN, tree } = webglTree
 *
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * let gl = null
 * let frameId = 0
 *
 * function start() {
 *   const canvas = document.body.appendChild(document.createElement('canvas'))
 *   canvas.width = 400
 *   canvas.height = 300
 *   gl = canvas.getContext('webgl2')
 *   const scene = renderTarget(gl)
 *   const cam = tree.createCamera({ eye: [0, 107, 215] })
 *   const frame = (ms) => {
 *     cam.eye[0] = 215 * Math.sin(ms / 1000)
 *     cam.eye[2] = 215 * Math.cos(ms / 1000)
 *     twgl.bindFramebufferInfo(gl, scene)
 *     gl.enable(gl.DEPTH_TEST)
 *     gl.clearColor(0.075, 0.553, 0.459, 1)
 *     gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *     setCamera(gl, cam)
 *     axes(gl, { size: 100 })
 *     twgl.bindFramebufferInfo(gl, SCREEN)
 *     image(gl, scene.color)
 *     frameId = requestAnimationFrame(frame)
 *   }
 *   frameId = requestAnimationFrame(frame)
 *   out.textContent = 'running · click to dispose'
 * }
 *
 * function stop() {
 *   cancelAnimationFrame(frameId)
 *   dispose(gl)
 *   gl.getExtension('WEBGL_lose_context').loseContext()
 *   gl.canvas.remove()
 *   gl = null
 *   out.textContent = 'disposed · click to start again'
 * }
 *
 * document.addEventListener('click', () => (gl ? stop() : start()))
 * start()
 */
export function dispose(gl) {
  const ctx = _registry.get(gl);
  if (!ctx) return;
  for (const t of [...ctx.targets]) { if (typeof t.dispose === 'function') t.dispose(); }
  ctx.targets.clear();
  ctx.pickTarget = null;
  ctx.pipes = {};
  if (ctx.textures && typeof gl.deleteTexture === 'function') for (const t of ctx.textures) gl.deleteTexture(t);
  ctx.textures = null;
  if (ctx.readbacks) {
    for (const r of ctx.readbacks.list) { if (typeof gl.deleteSync === 'function') gl.deleteSync(r.sync); r.reject(new Error('[webgl.tree] readPixel: the context was disposed.')); }
    for (const b of ctx.readbacks.pool) if (typeof gl.deleteBuffer === 'function') gl.deleteBuffer(b);
    ctx.readbacks = null;
  }
  for (const k of Object.keys(ctx.programs)) {
    const p = ctx.programs[k];
    if (p && p.program && typeof gl.deleteProgram === 'function') gl.deleteProgram(p.program);
  }
  ctx.programs = {};
  for (const g of Object.values(ctx.gizmos)) {
    if (g.buffer && typeof gl.deleteBuffer === 'function') for (const a of Object.values(g.buffer.attribs)) gl.deleteBuffer(a.buffer);
  }
  ctx.gizmos = {};
  if (ctx.quad) {
    for (const a of Object.values(ctx.quad.attribs || {})) { if (a.buffer && typeof gl.deleteBuffer === 'function') gl.deleteBuffer(a.buffer); }
    if (ctx.quad.indices && typeof gl.deleteBuffer === 'function') gl.deleteBuffer(ctx.quad.indices);
    ctx.quad = null;
  }
  _registry.delete(gl);
}
