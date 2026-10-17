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
 * The format follows the source: a Float32Array is RGBA32F with type FLOAT —
 * radiance, unclamped, what a tone operator needs — and any other array a byte
 * per channel. `internalFormat` and `type` override both where twgl cannot
 * infer the pair, as a Uint16Array of half-floats cannot be.
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
const _isBitmap = (s) => typeof ImageBitmap !== 'undefined' && s instanceof ImageBitmap;

// UNPACK_FLIP_Y_WEBGL has no effect on an ImageBitmap; a canvas holding the same
// pixels is flipped like any element. One scratch canvas, resized to the bitmap.
let _scratch = null;
function _viaCanvas(bitmap) {
  const w = bitmap.width, h = bitmap.height;
  if (!_scratch) _scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  if (_scratch.width !== w || _scratch.height !== h) { _scratch.width = w; _scratch.height = h; }
  const g = _scratch.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.drawImage(bitmap, 0, 0);
  return _scratch;
}

function _opts(gl, o) {
  const mip = o.mipmaps === true;
  return {
    min: mip ? gl.LINEAR_MIPMAP_LINEAR : (o.minMag || gl.LINEAR),
    mag: o.minMag || gl.LINEAR,
    wrap: o.wrap || gl.CLAMP_TO_EDGE,
    auto: mip,
  };
}

// The internal format and upload type a pixel source asks for. A Float32Array
// holds radiance, which is a 32F format; everything else is a byte, and would
// clamp. twgl would otherwise reach texImage2D as (RGBA, FLOAT) — an invalid
// combination — so both have to be stated here. WebGL2's table pairs each float
// format with one type (32F with FLOAT, 16F with HALF_FLOAT), and
// `opts.internalFormat` / `opts.type` override both where twgl cannot infer a
// type (a Uint16Array of half-floats). `opts.format` picks the channels — a
// density volume is one channel, so it states gl.RED and gets R8.
const _CHANNELS = (gl, format) =>
  format === gl.RED ? 1 : format === gl.RG ? 2 : format === gl.RGB ? 3 : 4;

function _formatOf(gl, data, o) {
  const format = o.format || gl.RGBA;
  const ch = _CHANNELS(gl, format);
  const float = data instanceof Float32Array;
  const half = o.type === gl.HALF_FLOAT;
  const B8 = [gl.R8, gl.RG8, gl.RGB8, gl.RGBA8];
  const F32 = [gl.R32F, gl.RG32F, gl.RGB32F, gl.RGBA32F];
  const F16 = [gl.R16F, gl.RG16F, gl.RGB16F, gl.RGBA16F];
  const internalFormat = o.internalFormat || (float ? F32[ch - 1] : half ? F16[ch - 1] : B8[ch - 1]);
  const type = o.type ||
    (F32.indexOf(internalFormat) >= 0 ? gl.FLOAT :
      F16.indexOf(internalFormat) >= 0 ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE);
  return { internalFormat, format, type, channels: ch };
}

// One scratch typed array per source type, resized as needed: a caller never
// sees the flip, and a repeated upload allocates once.
let _scratch8 = null, _scratch32 = null;
function _flippedRows(data, width, height, channels, slices) {
  const out = data instanceof Float32Array
    ? (_scratch32 && _scratch32.length === data.length ? _scratch32 : (_scratch32 = new Float32Array(data.length)))
    : (_scratch8 && _scratch8.length === data.length ? _scratch8 : (_scratch8 = new Uint8Array(data.length)));
  const row = width * channels;              // a texel is `channels` values wide
  const slice = row * height;
  for (let s = 0; s < slices; s++) {
    for (let y = 0; y < height; y++) {
      const from = s * slice + y * row;
      const part = data.subarray ? data.subarray(from, from + row) : data.slice(from, from + row);
      out.set(part, s * slice + (height - 1 - y) * row);   // rows within each slice, never slices
    }
  }
  return out;
}

// The pixel path of texture(): the format is resolved, the rows are flipped
// when asked, and the size is registered for filter's uTexelSize.
function _pixelTexture(gl, ctx, source, o) {
  const spec = _opts(gl, o);
  const format = _formatOf(gl, source.data, o);
  const layers = typeof source.layers === 'number' ? source.layers : 0;
  const depth = layers || (typeof source.depth === 'number' ? source.depth : 0);
  if (depth) {                                 // a volume, or an array of 2D slices
    spec.target = layers ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_3D;
    spec.depth = depth;
  }
  spec.internalFormat = format.internalFormat;
  spec.format = format.format;
  spec.type = format.type;
  spec.src = o.flip ? _flippedRows(source.data, source.width, source.height, format.channels, depth || 1) : source.data;
  spec.width = source.width;
  spec.height = source.height;
  spec.flipY = 0;
  if (spec.type === gl.FLOAT) {
    if (spec.min === gl.LINEAR && ctx.floatLinearExt === undefined) {
      ctx.floatLinearExt = gl.getExtension('OES_texture_float_linear') || false;
      if (!ctx.floatLinearExt) console.error('[webgl.tree] texture: OES_texture_float_linear is unavailable; a gl.FLOAT texture sampled linearly reads black — use gl.HALF_FLOAT or minMag: gl.NEAREST.');
    }
  }
  return createTexture(gl, spec);
}

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
  const ctx = contextOf(gl);
  const o = opts || {};
  if (_isPixels(source)) {
    const tex = _pixelTexture(gl, ctx, source, o);
    ctx.sizes.set(tex, [source.width, source.height]);
    if (!ctx.textures) ctx.textures = new Set();
    ctx.textures.add(tex);
    return tex;
  }
  const spec = _opts(gl, o);
  spec.src = _isBitmap(source) ? _viaCanvas(source) : source;
  spec.flipY = 1;
  const tex = createTexture(gl, spec);
  const size = _sizeOf(source);
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
  const ctx = contextOf(gl);
  setTextureFromElement(gl, tex, _isBitmap(source) ? _viaCanvas(source) : source, { flipY: 1, auto: false });
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
  const ctx = contextOf(gl);
  const o = opts || {};
  const spec = _opts(gl, o);
  // the faces go up now, in GL's order and unflipped — twgl would load element faces
  // asynchronously behind a one-pixel placeholder, so a first frame would sample that
  const tex = createTexture(gl, { target: gl.TEXTURE_CUBE_MAP, min: spec.min, mag: spec.mag, wrap: gl.CLAMP_TO_EDGE, auto: false });
  const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, faces[i]);
  if (spec.auto) gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  if (!ctx.textures) ctx.textures = new Set();
  ctx.textures.add(tex);
  return tex;
}
