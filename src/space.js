/**
 * @file Space — points and directions between world, eye, NDC and screen, through the installed camera.
 * @module webgl.tree/space
 * @license AGPL-3.0-only
 *
 * Every call reads the camera `setCamera` installed and the current viewport.
 * Screen space is canvas space: the canvas's logical pixels, top-left, y down —
 * what the pointer, `pick`, labels and `beginHUD` count, so a pointer event's
 * offset feeds these calls as is. `fragCoord` crosses to window space: the
 * drawing buffer's device pixels, bottom-left, y up — what `gl_FragCoord`,
 * `readPixel` and `image` count.
 *
 * @details
 * tree's mapLocation, mapDirection, unproject, pixelRatio and mat4Viewport
 * with the view bag, the viewport and WEBGL supplied. The viewport is read
 * from gl.VIEWPORT and written into module scratch in canvas space as
 * [x, y + h, w, −h], so a sub-viewport composes through W's origin. The
 * device-pixel scale is the drawing buffer's width over the host's logical
 * width, or over the canvas's client width without a host.
 */

'use strict';

import {
  mapLocation as _mapLocation, mapDirection as _mapDirection, unproject as _unproject,
  pixelRatio as _pixelRatio, mat4Viewport as _mat4Viewport, WEBGL,
} from '@nakednous/tree';
import { contextOf, viewOf } from './context.js';

const _vp = [0, 0, 0, 0];

/**
 * Device pixels per canvas pixel.
 * @param {WebGL2RenderingContext} gl
 * @returns {number}
 * @ignore
 */
export function canvasScale(gl) {
  const host = contextOf(gl).host;
  const w = host && host.view ? host.view.vp[2] : (gl.canvas && gl.canvas.clientWidth) || 0;
  return w > 0 ? gl.drawingBufferWidth / w : 1;
}

/**
 * The current viewport in canvas space, [x, y + h, w, −h], in module scratch.
 * @param {WebGL2RenderingContext} gl
 * @returns {number[]}
 * @ignore
 */
export function canvasViewport(gl) {
  const v = gl.getParameter(gl.VIEWPORT), s = canvasScale(gl);
  _vp[0] = v[0] / s; _vp[1] = (gl.drawingBufferHeight - v[1]) / s; _vp[2] = v[2] / s; _vp[3] = -v[3] / s;
  return _vp;
}
const _viewport = canvasViewport;

/**
 * Map a point from one space to another through the installed camera.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} out  3-element destination.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {string} from  `tree.WORLD`, `tree.EYE`, `tree.NDC` or `tree.SCREEN`.
 * @param {string} to  One of the same.
 * @returns {number[]} out
 * @example
 * <caption>The tip of the spinning x axis, mapped from world space to canvas pixels: the white cross drawn there stays on it.</caption>
 * const { setCamera, axes, beginHUD, endHUD, cross, mapLocation, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), tip = tree.vec3(), screen = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulPoint(tip, M, 100, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 100 })
 *   mapLocation(gl, screen, tip[0], tip[1], tip[2], tree.WORLD, tree.SCREEN)
 *   beginHUD(gl)
 *   cross(gl, { x: screen[0], y: screen[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(gl)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function mapLocation(gl, out, x, y, z, from, to) {
  return _mapLocation(out, x, y, z, from, to, viewOf(gl), _viewport(gl), WEBGL);
}

/**
 * Map a direction from one space to another through the installed camera.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} out  3-element destination.
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @param {string} from  `tree.WORLD`, `tree.EYE`, `tree.NDC` or `tree.SCREEN`.
 * @param {string} to  One of the same.
 * @returns {number[]} out
 * @example
 * <caption>The spinning x axis's direction, mapped from world space to the screen: the white cross, placed 80 pixels from the center along it, rides over the red axis.</caption>
 * const { setCamera, axes, beginHUD, endHUD, cross, mapDirection, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const M = tree.mat4(), q = tree.quat(), d = tree.vec3(), onScreen = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulDir(d, M, 1, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 120 })
 *   mapDirection(gl, onScreen, d[0], d[1], d[2], tree.WORLD, tree.SCREEN)
 *   const len = Math.hypot(onScreen[0], onScreen[1]) || 1
 *   beginHUD(gl)
 *   cross(gl, { x: 200 + 80 * onScreen[0] / len, y: 150 + 80 * onScreen[1] / len, size: 20, color: [1, 1, 1, 1] })
 *   endHUD(gl)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function mapDirection(gl, out, dx, dy, dz, from, to) {
  return _mapDirection(out, dx, dy, dz, from, to, viewOf(gl), _viewport(gl), WEBGL);
}

/**
 * The world ray under a canvas pixel: its origin on the near plane and its unit direction.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} outO  3-element origin.
 * @param {number[]} outD  3-element unit direction.
 * @param {number} sx  Canvas x, canvas pixels.
 * @param {number} sy  Canvas y, canvas pixels, down.
 * @returns {number[]|null} outD, or null when the view cannot be inverted.
 * @example
 * <caption>Move the pointer over the canvas: the ray under its offset, cut where it meets the ground (y = 0), puts the small axes on the grid right under the pointer.</caption>
 * const { setCamera, axes, grid, unproject, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const ground = tree.mat4FromTRS(tree.mat4(), 0, 0, 0, ...tree.qFromAxisAngle(tree.quat(), 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const origin = tree.vec3(), dir = tree.vec3(), M = tree.mat4()
 * let px = 200, py = 150
 * canvas.addEventListener('pointermove', (e) => { px = e.offsetX; py = e.offsetY })
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { M: ground, size: 150, subdivisions: 15, color: [1, 1, 1, 1] })
 *   if (unproject(gl, origin, dir, px, py) && dir[1] < 0) {
 *     const s = -origin[1] / dir[1]
 *     tree.mat4FromTranslation(M, origin[0] + s * dir[0], 0, origin[2] + s * dir[2])
 *   }
 *   axes(gl, { M, size: 25 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function unproject(gl, outO, outD, sx, sy) {
  return _unproject(outO, outD, sx, sy, viewOf(gl), _viewport(gl), WEBGL);
}

/**
 * The `gl_FragCoord` of a canvas pixel: canvas space to window space, the
 * drawing buffer's device pixels, y up. The value of a pointer uniform,
 * beside the `uResolution` `filter` fills; the coordinates `readPixel` takes.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} out  2-element destination.
 * @param {number} x  Canvas x, canvas pixels.
 * @param {number} y  Canvas y, canvas pixels, down.
 * @returns {number[]} out
 * @example
 * <caption>Move the pointer over the canvas: an amber disc 40 device pixels in radius follows it — the fragment shader compares its own gl_FragCoord with uMouse, the pointer's.</caption>
 * const { program, filter, fragCoord, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const spot = program(gl, `#version 300 es
 * precision highp float;
 * uniform vec2 uMouse;
 * out vec4 outColor;
 * void main() {
 *   float d = distance(gl_FragCoord.xy, uMouse);
 *   outColor = vec4(mix(vec3(1.0, 0.82, 0.4), vec3(0.075, 0.553, 0.459), smoothstep(38.0, 42.0, d)), 1.0);
 * }`)
 * const uniforms = { uMouse: tree.vec2() }
 * fragCoord(gl, uniforms.uMouse, 200, 150)
 * canvas.addEventListener('pointermove', (e) => fragCoord(gl, uniforms.uMouse, e.offsetX, e.offsetY))
 *
 * function frame() {
 *   filter(gl, spot, uniforms)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function fragCoord(gl, out, x, y) {
  const s = canvasScale(gl);
  out[0] = x * s;
  out[1] = gl.drawingBufferHeight - y * s;
  return out;
}

/**
 * World units per canvas pixel at an eye-space depth, for the installed camera.
 * @param {WebGL2RenderingContext} gl
 * @param {number} eyeZ  The eye-space z of the depth measured.
 * @returns {number}
 * @example
 * <caption>The eye dollies between 200 and 600 from the grid, whose cells are 20 units: a white cross sized 20 ÷ pixelRatio pixels spans exactly one cell at every distance.</caption>
 * const { setCamera, grid, beginHUD, endHUD, cross, pixelRatio, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 0, 400] })
 *
 * function frame(ms) {
 *   const d = 400 + 200 * Math.sin(ms / 1000)
 *   cam.eye[2] = d
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   beginHUD(gl)
 *   cross(gl, { x: 200, y: 150, size: 20 / pixelRatio(gl, -d), color: [1, 0.82, 0.4, 1] })
 *   endHUD(gl)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function pixelRatio(gl, eyeZ) {
  const vp = _viewport(gl);
  return _pixelRatio(viewOf(gl).mat4Proj, -vp[3], eyeZ, WEBGL);
}

/**
 * The viewport matrix W: NDC to canvas pixels (y down), depth to [0, 1].
 * @param {WebGL2RenderingContext} gl
 * @param {Float32Array|number[]} out
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>W · P · V takes the spinning x axis's tip straight to canvas pixels, where the white cross is drawn over it.</caption>
 * const { setCamera, axes, beginHUD, endHUD, cross, mat4Viewport, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4(), W = tree.mat4(), WPV = tree.mat4(), q = tree.quat(), tip = tree.vec3()
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 100 })
 *   tree.mat4Mul(WPV, mat4Viewport(gl, W), viewOf(gl).mat4PV)
 *   tree.mat4MulPoint(tip, tree.mat4Mul(WPV, WPV, M), 100, 0, 0)
 *   beginHUD(gl)
 *   cross(gl, { x: tip[0], y: tip[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(gl)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function mat4Viewport(gl, out) {
  return _mat4Viewport(out, _viewport(gl), WEBGL);
}
