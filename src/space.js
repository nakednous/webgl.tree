/**
 * @file Space — points and directions between world, eye, NDC and screen, through the installed camera.
 * @module webgl.tree/space
 * @license AGPL-3.0-only
 *
 * Every call reads the camera `setCamera` installed and the current viewport.
 * Screen space is the viewport's pixels, y down: the space `beginHUD` draws in.
 *
 * @details
 * tree's mapLocation, mapDirection, unproject, pixelRatio and mat4Viewport
 * with the view bag, the viewport and WEBGL supplied. The viewport is read
 * from gl.VIEWPORT into module scratch as [0, h, w, −h].
 */

'use strict';

import {
  mapLocation as _mapLocation, mapDirection as _mapDirection, unproject as _unproject,
  pixelRatio as _pixelRatio, mat4Viewport as _mat4Viewport, WEBGL,
} from '@nakednous/tree';
import { viewOf } from './context.js';

const _vp = [0, 0, 0, 0];
const _viewport = (gl) => {
  const v = gl.getParameter(gl.VIEWPORT);
  _vp[0] = 0; _vp[1] = v[3]; _vp[2] = v[2]; _vp[3] = -v[3];
  return _vp;
};

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
 * <caption>The tip of the spinning x axis, mapped from world space to screen pixels: the white cross drawn there stays on it.</caption>
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
 * The world ray under a screen point: its origin on the near plane and its unit direction.
 * @param {WebGL2RenderingContext} gl
 * @param {number[]} outO  3-element origin.
 * @param {number[]} outD  3-element unit direction.
 * @param {number} sx  Screen x, viewport pixels.
 * @param {number} sy  Screen y, viewport pixels, down.
 * @returns {number[]|null} outD, or null when the view cannot be inverted.
 * @example
 * <caption>Move the pointer over the canvas: the ray under it, cut where it meets the ground (y = 0), puts the small axes on the grid right under the pointer.</caption>
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
 * canvas.addEventListener('pointermove', (e) => {
 *   px = e.offsetX * canvas.width / canvas.clientWidth
 *   py = e.offsetY * canvas.height / canvas.clientHeight
 * })
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
 * World units per screen pixel at an eye-space depth, for the installed camera.
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
 * The viewport matrix W: NDC to screen pixels (y down), depth to [0, 1].
 * @param {WebGL2RenderingContext} gl
 * @param {Float32Array|number[]} out
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>W · P · V takes the spinning x axis's tip straight to screen pixels, where the white cross is drawn over it.</caption>
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
