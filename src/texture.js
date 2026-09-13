/**
 * @file Textures — create, refresh, cube maps; one orientation.
 * @module twgl.tree/texture
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
