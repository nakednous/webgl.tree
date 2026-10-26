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
 *                             //   + depth  → a volume  (TEXTURE_3D)
 *                             //   + layers → an array  (TEXTURE_2D_ARRAY)
 * upload(gl, tex, source)     // refresh from a video or canvas each frame
 * cubemap(gl, faces, opts)    // six sources → a cube map
 * ```
 *
 * @details
 * One orientation rule: every texture the bridge holds is in GL's bottom-up
 * space. An element or a bitmap arrives top-down and is flipped at upload,
 * through a scratch 2D canvas for the bitmap, whose orientation GL's flag
 * cannot turn (it is fixed at the bitmap's creation). A `{ data, width, height }`
 * pixel source is taken as given — row 0 at v = 0 — so a caller holding rows the
 * other way asks for `flip`, the same normalization the element path applies
 * silently; the [hdr](hdr.html) decoder hands back file order and a caller asks
 * for it that way. A render target's texture is already bottom-up
 * and never passes through upload. So image, pane, filter and the pick pass
 * carry no flip switch, and a pane's default uvs read a texture upright.
 *
 * The three verbs are the layer's (`idiom`'s `texture`, `upload` and `cubemap`,
 * §7 #123): it states the cube's face order and records each texture's size for
 * `uTexelSize`; the creation is the backend's, and the orientation rule above is
 * the backend's own statement.
 *
 * The format follows the source: a Float32Array is RGBA32F with type FLOAT —
 * radiance, unclamped, what a tone operator needs — and any other array a byte
 * per channel. `internalFormat` and `type` override both where twgl cannot
 * infer the pair, as a Uint16Array of half-floats cannot be.
 */

'use strict';

import { texture as textureOf, upload as uploadOf, cubemap as cubemapOf } from '@nakednous/idiom';
import { contextOf } from './context.js';

/**
 * Create a texture from an element, a bitmap or raw pixels.
 * @details Elements and bitmaps are flipped into GL's bottom-up space; a
 * { data, width, height } pixel source is taken as given unless `flip` asks
 * for the same normalization, since GL cannot flip a typed array at upload
 * (`UNPACK_FLIP_Y_WEBGL` is defined for elements alone). A Float32Array source
 * becomes a 32F format — radiance, unclamped, the range a tone operator has
 * something to compress — where any other array is a byte per channel, and
 * `format` picks how many channels either carries.
 * A source with `depth` or `layers` is a volume or an array of slices: the same
 * normalization, with `flip` reversing rows inside each slice and the slice
 * order left as given (slice 0 at w = 0, the px-space counterpart of row 0 at
 * v = 0).
 * @param {WebGL2RenderingContext} gl
 * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement|{data:ArrayBufferView,width:number,height:number,depth?:number,layers?:number}} source
 *        A pixel source with `depth` becomes a volume (`TEXTURE_3D`); with
 *        `layers` an array of 2D slices (`TEXTURE_2D_ARRAY`). The data is
 *        flat, slice after slice: slice 0 is w = 0.
 * @param {{ minMag?:number, wrap?:number, mipmaps?:boolean, flip?:boolean,
 *           format?:number, internalFormat?:number, type?:number }} [opts]
 *        flip: the pixel path's row reversal, into GL's bottom-up space — rows
 *        within each slice, never the slice order.
 *        format: the channels — gl.RED (one, a density), gl.RG, gl.RGB or
 *        gl.RGBA (default). The internal format follows from it and the array
 *        type: R8 / RG8 / RGB8 / RGBA8 for bytes, the 32F or 16F family
 *        otherwise. A one-channel source is what a volume usually is.
 *        internalFormat / type: for a format twgl cannot infer from the array
 *        — RGBA16F with a Uint16Array of half-floats.
 *        mipmaps: generateMipmap covers 2D, 3D and array targets in WebGL 2.
 * @returns {WebGLTexture}
 * @example
 * <caption>Raw pixels start at the bottom row: magenta bottom-left and top-right, yellow in the other corners.</caption>
 * const { createCanvas, setCamera, texture, pane, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
 * @example
 * <caption>Radiance past 1.0 survives the upload: a Radiance file decoded to a float texture, then mapped down by hand.</caption>
 * const { createCanvas, program, filter, texture, loadHDR } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const show = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uSource;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   vec3 L = texture(uSource, vTexCoord).rgb;             // may exceed 1.0
 *   outColor = vec4(L / (1.0 + L), 1.0);                  // Reinhard, per pixel
 * }`)
 *
 * loadHDR('models/tone_sunrise_128x48.hdr').then((hdr) => {
 *   const radiance = texture(gl, hdr)                     // RGBA32F, from the array type
 *   gl.clearColor(0, 0, 0, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT)
 *   filter(gl, show, null, radiance)
 * })
 */
export function texture(gl, source, opts) {
  return textureOf(contextOf(gl), source, opts);
}

/**
 * Refresh a texture from an element — a video or camera frame each frame.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLTexture} tex
 * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @returns {WebGLTexture} tex
 * @example
 * <caption>A 2D canvas redrawn every frame: the magenta bar sweeps left to right under a yellow strip along the top.</caption>
 * const { createCanvas, setCamera, texture, upload, pane, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
  return uploadOf(contextOf(gl), tex, source);
}

/**
 * A cube map from six sources in GL's face order (+X, −X, +Y, −Y, +Z, −Z), unflipped.
 * @param {WebGL2RenderingContext} gl
 * @param {Array} faces  Six elements or bitmaps.
 * @param {{ minMag?:number, mipmaps?:boolean }} [opts]
 * @returns {WebGLTexture}
 * @example
 * <caption>A cube sampling a cube map by direction: +X magenta on the right, +Y white on top, +Z blue in front.</caption>
 * const { createCanvas, setCamera, bind, draw, cubemap, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
  return cubemapOf(contextOf(gl), faces, opts);
}
