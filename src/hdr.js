/**
 * @file HDR — Radiance (.hdr) RGBE bytes → the pixel source `texture` uploads.
 * @module webgl.tree/hdr
 * @license AGPL-3.0-only
 *
 * A floating-point texture needs pixels no image decoder in the browser can
 * give it: `loadImage` hands over an `ImageBitmap` of 8-bit codes, and a
 * fullscreen pass that tone-maps radiance needs values above 1.0 to still be
 * there when it runs. Radiance's RGBE is the one high-dynamic-range format a
 * few dozen lines decode, so the bridge reads it here:
 *
 * ```
 * const hdr = await loadHDR('/hdri/venice_sunset_1k.hdr')   // { data, width, height }
 * const tex = texture(gl, hdr)                              // RGBA32F, from the array type
 * filter(gl, toneProg, u, tex)                              // uSource = the radiance
 * ```
 *
 * Format and sources. RGBE stores three 8-bit mantissas and a shared exponent
 * per pixel — `v · 2^(e − 136)` — the format of Greg Ward's RADIANCE (Ward,
 * *Real Pixels*, Graphics Gems II, 1991). The decoder follows the structure of
 * the reference `rgbe.c` reader and of three.js's `HDRLoader` (adapted from
 * Bruce Walter's code), and agrees with that implementation pixel for pixel:
 * the scale is the exact `v · 2^(e − 136)` rather than `v · 2^(e − 128) / 255`,
 * which is the same value written as a single power rather than a quotient of
 * two, and the exponent byte reaches the float through the bit pattern of
 * `2^(e − 136)`, so no `Math.pow` runs per pixel. Neither form adds the
 * `+ 0.5` that `rgbe.c`'s floating-point read carries: that offset shifts every
 * pixel up by half a mantissa step — measured at 0.04 % of the mean on a
 * Poly Haven HDRI, and 0.2 % at the format's top — and no file states it is
 * there.
 *
 * Rows are written in the order the file states (`-Y` — row 0 at the top — or
 * `+Y`), never flipped, since GL's bottom-up space is the upload's concern (see
 * texture.js).
 *
 * The inverse of `decodeRGBE` is `encodeRGBE` below, and a decoder is trusted
 * by round-tripping through an encoder it does not share code with, and by
 * agreeing with a second implementation on a real file —
 * `node testing/compare-three-hdr.mjs <file.hdr>`.
 */

'use strict';

// Radiance's own threshold: at or below it a pixel is zero, which is what
// keeps the (v + 0.5) reconstruction from inventing a value in empty bytes.
const _MIN_RADIANCE = 1e-32;
// 16 Mpixel of RGBA32F is 256 MB of output: past this the tab is gone before
// anything on screen says why, so the refusal comes from here.
const _DEFAULT_MAX_PIXELS = 16 * 1024 * 1024;

const _fv = new DataView(new ArrayBuffer(4));

// The shared exponent as a float32: the bit pattern of 2^(e − 136) — mantissa
// zero, biased exponent — read straight out of the view, no Math.pow per pixel.
// 256 entries, made once at load, indexed by the exponent byte a pixel carries.
const _SCALES = new Float32Array(256);
for (let e = 0; e < 256; e++) {
  _fv.setUint32(0, e < 10 ? 0 : (e - 9) << 23, true);   // e < 10 underflows to zero
  _SCALES[e] = _fv.getFloat32(0, true);
}

/**
 * Encode three linear radiance samples and a shared exponent to RGBE bytes.
 * The inverse of a pixel in `decodeRGBE`: the largest component becomes a byte
 * level between 128 and 255 — `level = round(v / 2^(e − 136))` with e the
 * exponent that carries it — so all eight bits are spent and the components
 * keep their ratio. The level is an integer: 0.0 comes back exactly, and
 * everything else to within half a level, the 1/512 an 8-bit mantissa costs at
 * worst.
 * @param {number} r  Red, ≥ 0.
 * @param {number} g  Green.
 * @param {number} b  Blue.
 * @param {Uint8Array} [out]  Four bytes to write; a new one when absent.
 * @returns {Uint8Array} out
 * @example
 * <caption>A level and the exponent that carries it: 2.0 writes as level 128 at e = 130, and decodeRGBE reads the radiance back.</caption>
 * const { encodeRGBE, decodeRGBE } = webglTree
 *
 * const rgba = encodeRGBE(2, 2, 2)
 * // rgba is [128, 128, 128, 130] — three levels and a shared exponent
 * const hdr = decodeRGBE(new Uint8Array([
 *   35, 63, 82, 65, 68, 73, 65, 78, 67, 69, 10, 70, 79, 82, 77, 65, 84, 61,
 *   51, 50, 45, 98, 105, 116, 95, 114, 108, 101, 95, 114, 103, 98, 101, 10,
 *   10, 45, 89, 32, 49, 32, 43, 88, 32, 49, 10, ...rgba,
 * ]))
 * // hdr.data[0] is 2 — 128 · 2^(130 − 136)
 */
export function encodeRGBE(r, g, b, out) {
  const o = out || new Uint8Array(4);
  const max = Math.max(r, g, b);
  if (!(max >= _MIN_RADIANCE)) { o[0] = o[1] = o[2] = o[3] = 0; return o; }
  // The exponent whose scale carries max as a byte level of 128 to 255 — the
  // finest step the format has for this magnitude. The float32's own exponent
  // sets the base, one scale step below the level 255 needs, and the search
  // steps up until max fits a byte. `_SCALES` is the decoder's own table, so
  // the two cannot drift apart.
  _fv.setFloat32(0, max, true);
  let e = Math.min(255, Math.max(1, ((_fv.getUint32(0, true) >>> 23) & 0xff) - 127 + 128));
  while (e < 255 && max / _SCALES[e] > 255) e++;
  o[0] = Math.min(255, Math.round(r / _SCALES[e]));
  o[1] = Math.min(255, Math.round(g / _SCALES[e]));
  o[2] = Math.min(255, Math.round(b / _SCALES[e]));
  o[3] = e;
  return o;
}

const _digits = (s) => {
  const m = /(\d+)/.exec(s);
  return m ? +m[1] : 0;
};

// The header: a magic line, keyed lines and comments, a blank line, then the
// resolution string (`-Y 512 +X 1024`). Anything before the resolution is
// skipped — XMP and other writers put blocks there — so the walk stops at the
// first line that states a dimension.
function _headerAt(data) {
  let pos = 0, height = 0, width = 0, flipRows = false;
  const n = data.length;
  while (pos < n) {
    let end = pos;
    while (end < n && data[end] !== 10) end++;
    const line = String.fromCharCode.apply(null, data.subarray(pos, Math.min(end, pos + 400)));
    pos = end + 1;
    if (/^#\?/.test(line)) continue;
    const res = /^\s*([-+])([XY])\s+(\d+)\s+([-+])([XY])\s+(\d+)\s*$/.exec(line);
    if (res) {
      const first = res[2].toUpperCase(), second = res[5].toUpperCase();
      if (first === 'Y' && second === 'X') {
        height = +res[3]; width = +res[6];
        flipRows = res[1] === '+';           // +Y: row 0 at the bottom
      } else if (first === 'X' && second === 'Y') {
        width = +res[3]; height = +res[6];
        flipRows = res[1] === '+';           // +X: column 0 on the right
      } else {
        throw new Error('[webgl.tree] hdr: the resolution names ' + first + ' then ' + second + '; -Y h +X w expected.');
      }
      return { width, height, flipRows, pos };
    }
    if (line === '') continue;                    // a writer may separate the keys from the resolution
  }
  throw new Error('[webgl.tree] hdr: no resolution line — the file is not a Radiance image.');
}

// One scanline of RGBE bytes into `row`: either the new-style RLE (4 planes,
// runs of 128 bytes or fewer) or the flat tuples an old writer leaves.
function _scanline(data, pos, row, w, off, rowBytes) {
  const end = data.length;
  if (w >= 8 && w < 32768 && pos + 3 < end && data[pos] === 2 && data[pos + 1] === 2 && (data[pos + 2] & 0x80) === 0) {
    const scanline = (data[pos + 2] << 8) | data[pos + 3];
    if (scanline !== w) throw new Error('[webgl.tree] hdr: scanline width ' + scanline + ', image width ' + w + '.');
    pos += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < w) {
        if (pos >= end) throw new Error('[webgl.tree] hdr: the file ends inside scanline ' + (off / rowBytes) + '.');
        const count = data[pos++];
        if (count > 128) {                       // a run of one byte
          if (pos >= end) throw new Error('[webgl.tree] hdr: the file ends inside a run.');
          const v = data[pos++];
          for (let i = 0; i < count - 128; i++) row[(x + i) * 4 + c] = v;
          x += count - 128;
        } else {                                 // a literal run
          if (count === 0 || pos + count > end) throw new Error('[webgl.tree] hdr: bad run length in scanline ' + (off / rowBytes) + '.');
          for (let i = 0; i < count; i++) row[(x + i) * 4 + c] = data[pos + i];
          pos += count;
          x += count;
        }
        if (x > w) throw new Error('[webgl.tree] hdr: a run overruns scanline ' + (off / rowBytes) + '.');
      }
    }
    return pos;
  }
  // flat: 4 bytes per pixel, in file order (the scanline is one plane-less array)
  if (pos + w * 4 > end) throw new Error('[webgl.tree] hdr: the file ends inside scanline ' + (off / rowBytes) + '.');
  for (let i = 0; i < w * 4; i++) row[i] = data[pos + i];
  return pos + w * 4;
}

/**
 * Decode Radiance RGBE bytes into the pixel source `texture` takes.
 * @details Every pixel becomes four float channels — R, G, B and 1 — in the
 * order the file states, top-down for the `-Y` every writer emits; rows are
 * flipped only when `opts.rowOrder` asks for the other convention. The
 * decoder holds no state, allocates its output once, and needs no DOM, so it
 * runs under node:test as well as in the browser.
 * @param {ArrayBuffer|Uint8Array} bytes  The whole file.
 * @param {{ rowOrder?:string, maxPixels?:number }} [opts]
 *        rowOrder: `FILE` (default) or `BOTTOM_UP` — the latter for a caller
 *        whose texture space is GL's, row 0 at v = 0.
 *        maxPixels: refuse past this many pixels (default 16 MPixel).
 * @returns {{ data:Float32Array, width:number, height:number }} Radiance in
 *          linear light: what `texture` uploads as RGBA32F, and the range a
 *          tone operator compresses.
 * @example
 * <caption>A 2 × 1 file: black, then white — the smallest Radiance image, decoded to floats.</caption>
 * const { decodeRGBE } = webglTree
 *
 * // #?RADIANCE / FORMAT=32-bit_rle_rgbe / blank / -Y 1 +X 2, then two flat pixels:
 * // (0,0,0,0) and 1.0 at e = 128 → mantissas 128 and exponent 128
 * const bytes = new Uint8Array([
 *   35, 63, 82, 65, 68, 73, 65, 78, 67, 69, 10,              // #?RADIANCE
 *   70, 79, 82, 77, 65, 84, 61, 51, 50, 45, 98, 105, 116,    // FORMAT=32-bit
 *   95, 114, 108, 101, 95, 114, 103, 98, 101, 10,            // _rle_rgbe
 *   10,                                                      // the blank line
 *   45, 89, 32, 49, 32, 43, 88, 32, 50, 10,                  // -Y 1 +X 2
 *   0, 0, 0, 0, 128, 128, 128, 128,                          // the two pixels
 * ])
 * const hdr = decodeRGBE(bytes)
 * // hdr.width 2 · hdr.height 1 · hdr.data[4] = 1 (the second pixel's red)
 */
export function decodeRGBE(bytes, opts) {
  const o = opts || {};
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = _headerAt(data);
  const { width: w, height: h } = head;
  if (!(w > 0) || !(h > 0)) throw new Error('[webgl.tree] hdr: the resolution states ' + w + ' × ' + h + '.');
  const max = o.maxPixels || _DEFAULT_MAX_PIXELS;
  if (w * h > max) {
    throw new Error('[webgl.tree] hdr: ' + w + ' × ' + h + ' is past maxPixels (' + max +
      '); pass a bigger one, or decode at a lower resolution.');
  }
  const flip = o.rowOrder === 'BOTTOM_UP';
  const out = new Float32Array(w * h * 4);
  const row = new Uint8Array(w * 4);
  let pos = head.pos;
  for (let y = 0; y < h; y++) {
    pos = _scanline(data, pos, row, w, y * w * 4, w * 4);
    const at = (flip ? h - 1 - y : y) * w * 4;
    for (let x = 0; x < w; x++) {
      const p = x * 4, s = _SCALES[row[p + 3]], d = at + p;
      out[d] = row[p] * s;
      out[d + 1] = row[p + 1] * s;
      out[d + 2] = row[p + 2] * s;
      out[d + 3] = 1;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Fetch a Radiance `.hdr` file and decode it.
 * @details `decodeRGBE` over `fetch` — the browser's, or Node's from 18 —
 * with the same contract, so a caller that has the bytes already (a file
 * input, a cache) uses `decodeRGBE` directly and skips this.
 * @param {string} url
 * @param {{ fetch?:object, rowOrder?:string, maxPixels?:number }} [opts]
 *        fetch: the fetch init (credentials, mode, …). The rest reach
 *        `decodeRGBE`.
 * @returns {Promise<{ data:Float32Array, width:number, height:number }>}
 * @example
 * <caption>A Radiance file the page serves — a sun-lit ridge whose sun reads 2464 — decoded and tone-mapped with Reinhard.</caption>
 * const { createCanvas, program, filter, texture, loadHDR } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const tone = program(gl, `#version 300 es
 * precision highp float;
 * uniform sampler2D uSource;
 * uniform float uExposure;
 * in vec2 vTexCoord;
 * out vec4 outColor;
 * void main() {
 *   vec3 L = texture(uSource, vTexCoord).rgb * exp2(uExposure);
 *   outColor = vec4(pow(L / (1.0 + L), vec3(1.0 / 2.2)), 1.0);
 * }`)
 *
 * loadHDR('models/tone_sunrise_128x48.hdr').then((hdr) => {   // { data, width, height }
 *   const radiance = texture(gl, hdr)                        // RGBA32F, from the array type
 *   let exposure = -2
 *   setInterval(() => {
 *     exposure = exposure >= 2 ? -2 : exposure + 0.1
 *     gl.clearColor(0, 0, 0, 1)
 *     gl.clear(gl.COLOR_BUFFER_BIT)
 *     filter(gl, tone, { uExposure: exposure }, radiance)
 *   }, 50)
 * })
 */
export async function loadHDR(url, opts) {
  const o = opts || {};
  const res = await fetch(url, o.fetch);
  if (!res.ok) throw new Error('[webgl.tree] hdr: ' + url + ' → ' + res.status);
  return decodeRGBE(await res.arrayBuffer(), o);
}
