/**
 * @file Textures — create, refresh, cube maps; one orientation.
 * @module webgl.tree/texture
 * @license AGPL-3.0-only
 *
 * Textures from images, canvases, videos, bitmaps or raw pixels, stored the
 * way GL samples them, so nothing that draws one takes a flip option.
 *
 * ```
 * texture(gl, source, opts)   // an ImageBitmap, an element, or { data, width, height }
 * upload(gl, tex, source)     // refresh from a video or canvas each frame
 * cubemap(gl, faces, opts)    // six sources → a cube map
 * ```
 *
 * @details
 * One orientation rule: every texture the bridge holds is in GL's bottom-up
 * space. Decoded images and elements arrive top-down and are uploaded with
 * flipY on; a render target's texture is already bottom-up and never passes
 * through upload. So image, pane, filter and the pick pass carry no flip
 * switch, and a pane's default uvs read a texture upright.
 */

'use strict';

import { createTexture, setTextureFromElement } from 'twgl.js';
import { contextOf } from './context.js';

const _sizeOf = (s) => {
  if (!s) return null;
  const w = s.videoWidth || s.naturalWidth || s.width || 0, h = s.videoHeight || s.naturalHeight || s.height || 0;
  return w && h ? [w, h] : null;
};
const _isPixels = (s) => !!(s && s.data && typeof s.width === 'number' && typeof s.height === 'number' && !s.getContext);

function _opts(gl, o) {
  const mip = o.mipmaps === true;
  return {
    min: mip ? gl.LINEAR_MIPMAP_LINEAR : (o.minMag || gl.LINEAR),
    mag: o.minMag || gl.LINEAR,
    wrap: o.wrap || gl.CLAMP_TO_EDGE,
    auto: mip,
  };
}

/**
 * Create a texture from an element, a bitmap or raw pixels.
 * @details Elements and bitmaps are flipped into GL's bottom-up space; a
 * { data, width, height } pixel source is taken as given.
 * @param {WebGL2RenderingContext} gl
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement|{data:ArrayBufferView,width:number,height:number}} source
 * @param {{ minMag?:number, wrap?:number, mipmaps?:boolean }} [opts]
 * @returns {WebGLTexture}
 * @example
 * <caption>Raw pixels start at the bottom row: magenta bottom-left and top-right, yellow in the other corners.</caption>
 * import { setCamera, texture, pane, tree } from 'webgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const magenta = [255, 79, 216, 255]
 * const yellow = [255, 209, 102, 255]
 * const data = new Uint8Array([...magenta, ...yellow, ...yellow, ...magenta])
 * const tex = texture(gl, { data, width: 2, height: 2 }, { minMag: gl.NEAREST })
 *
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [0, 0, 205] }))
 * pane(gl, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 */
export function texture(gl, source, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  const spec = _opts(gl, o);
  if (_isPixels(source)) { spec.src = source.data; spec.width = source.width; spec.height = source.height; spec.flipY = 0; }
  else { spec.src = source; spec.flipY = 1; }
  const tex = createTexture(gl, spec);
  const size = _isPixels(source) ? [source.width, source.height] : _sizeOf(source);
  if (size) ctx.sizes.set(tex, size);
  if (!ctx.textures) ctx.textures = new Set();
  ctx.textures.add(tex);
  return tex;
}

/**
 * Refresh a texture from an element — a video or camera frame each frame.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @returns {WebGLTexture} tex
 * @example
 * <caption>A 2D canvas redrawn every frame: the magenta bar sweeps left to right under a yellow strip along the top.</caption>
 * import { setCamera, texture, upload, pane, tree } from 'webgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const board = document.createElement('canvas')
 * board.width = 256
 * board.height = 256
 * const g = board.getContext('2d')
 * const tex = texture(gl, board)
 * const cam = tree.createCamera({ eye: [0, 0, 205] })
 *
 * function frame(ms) {
 *   g.fillStyle = '#222'
 *   g.fillRect(0, 0, 256, 256)
 *   g.fillStyle = '#ff4fd8'
 *   g.fillRect((ms / 10) % 256, 0, 32, 256)
 *   g.fillStyle = '#ffd166'
 *   g.fillRect(0, 0, 256, 32)
 *   upload(gl, tex, board)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   pane(gl, [-100, 100, 0], [100, 100, 0], [100, -100, 0], [-100, -100, 0], { texture: tex })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function upload(gl, tex, source) {
  const ctx = contextOf(gl);
  setTextureFromElement(gl, tex, source, { flipY: 1, auto: false });
  const size = _sizeOf(source);
  if (size) ctx.sizes.set(tex, size);
  return tex;
}

/**
 * A cube map from six sources in GL's face order (+X, −X, +Y, −Y, +Z, −Z), unflipped.
 * @param {WebGL2RenderingContext} gl
 * @param {Array} faces  Six elements or bitmaps.
 * @param {{ minMag?:number, mipmaps?:boolean }} [opts]
 * @returns {WebGLTexture}
 * @example
 * <caption>A cube sampling a cube map by direction: +X magenta on the right, +Y white on top, +Z blue in front.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, bind, draw, cubemap, tree } from 'webgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const solid = (color) => {
 *   const c = document.createElement('canvas')
 *   c.width = c.height = 16
 *   const g = c.getContext('2d')
 *   g.fillStyle = color
 *   g.fillRect(0, 0, 16, 16)
 *   return c
 * }
 * // +X, −X, +Y, −Y, +Z, −Z
 * const cube = cubemap(gl, ['#ff4fd8', '#ffd166', '#ffffff', '#222222', '#4f9dff', '#222222'].map(solid))
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * uniform mat4 uModelViewProjectionMatrix;
 * out vec3 vDir;
 * void main() {
 *   vDir = aPosition.xyz;
 *   gl_Position = uModelViewProjectionMatrix * aPosition;
 * }`, `#version 300 es
 * precision highp float;
 * uniform samplerCube uCube;
 * in vec3 vDir;
 * out vec4 outColor;
 * void main() {
 *   outColor = texture(uCube, vDir);
 * }`])
 * const verts = twgl.primitives.createCubeVertices(120)
 * const box = twgl.createBufferInfoFromArrays(gl, { aPosition: verts.position, indices: verts.indices })
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [126, 105, 168] }))
 * bind(gl, prog, { uCube: cube })
 * draw(gl, box)
 */
export function cubemap(gl, faces, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  const spec = _opts(gl, o);
  spec.target = gl.TEXTURE_CUBE_MAP; spec.src = faces; spec.flipY = 0; spec.wrap = gl.CLAMP_TO_EDGE;
  const tex = createTexture(gl, spec);
  if (!ctx.textures) ctx.textures = new Set();
  ctx.textures.add(tex);
  return tex;
}
