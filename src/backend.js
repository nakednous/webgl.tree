/**
 * @file The twgl backend — `idiom`'s interface over one WebGL2 context.
 * @module webgl.tree/backend
 * @license AGPL-3.0-only
 *
 * One backend per context, made by `contextOf` and reached as `ctx.backend`:
 * the twenty-three members `idiom` calls, its four conventions, and the
 * bridge's own internal programs. Every member takes the context record first
 * and nothing here imports the registry, so a member never looks a context up.
 *
 * @details
 * The layer's composite verbs call these members; the bridge's own verbs call
 * them where the layer has none (picking, textures, the cube map). The API
 * ceremony lives here and nowhere else: twgl's programs, buffers, framebuffers,
 * textures, uniforms, draws and the readback's PBO fence.
 *
 * Three things the backend keeps so a draw need not repeat itself: what each
 * program already holds (numeric uniforms, skipped when unchanged), the vertex
 * array a program and a geometry share (twgl's, made on first use), and the
 * sizes of the textures it made.
 *
 * The record is the backend's own for a target — twgl's framebufferInfo,
 * extended — and `idiom` decorates it. `bindTarget` takes either that record
 * (`{ framebuffer }`), the raw binding a previous call returned, or `SCREEN`
 * (null): the first goes through twgl's verb, which sets the viewport; the
 * others are bound directly. The state verbs return what was in effect before
 * the call and take no value to ask only, and `clear` is a colour clear that
 * leaves the context's clear colour as it found it — the depth buffer is the
 * application's.
 */

'use strict';

import { WEBGL, mat4Mul } from '@nakednous/tree';
import {
  createProgramInfo, createBufferInfoFromArrays, setAttribInfoBufferFromArray,
  setUniforms, drawBufferInfo, createFramebufferInfo, resizeFramebufferInfo,
  bindFramebufferInfo, createTexture, setTextureFromElement, createVertexArrayInfo,
} from 'twgl.js';
import {
  PASS_VERT, FLAT_VERT, FLAT_FRAG, LINE_VERT, LINE_FRAG, WIDE_VERT,
  bindGeometry, samplersOf,
} from './programs.js';

// ── Textures ─────────────────────────────────────────────────────────────
// The source kinds, the format pair a pixel source asks for, the one
// orientation rule (GL's, bottom-up) and the scratch a flip or a bitmap needs.

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

function _optsOf(gl, o) {
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

// The pixel path of createTexture: the format is resolved, the rows are flipped
// when asked, and the size is registered for filter's uTexelSize.
function _pixelTexture(gl, ctx, source, o) {
  const spec = _optsOf(gl, o);
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

// ── Render targets ───────────────────────────────────────────────────────

/**
 * Resolve `renderTarget`'s options into twgl attachment specs. What the target
 * shapes mean for the API's objects: the colour attachments' formats, the depth
 * texture or renderbuffer, and the multisampled side.
 * @param {WebGL2RenderingContext} gl  For its constants.
 * @param {object} [opts]
 * @returns {{ attachments:object[], kinds:string[], multisample:object[]|null, samples:number,
 *             names:string[], color:boolean, depthTexture:boolean, float:boolean, float32:boolean }}
 *          attachments / kinds describe the sampleable framebuffer; multisample the
 *          renderbuffers drawn into when samples > 1, else null.
 * @ignore
 */
export function targetSpecs(gl, opts) {
  const o = opts || {};
  // colour attachments: a list of names, or { name: format, … } in order
  const byFormat = !!o.color && typeof o.color === 'object' && !Array.isArray(o.color);
  const names = Array.isArray(o.color) ? o.color.slice() : (byFormat ? Object.keys(o.color) : null);
  const base = o.format || (o.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE);
  const depthOnly = o.depth === true && !names && !o.depthTexture;
  const hasColor = !depthOnly && o.color !== false;
  const depthTexture = !!o.depthTexture || depthOnly;
  const hasDepth = o.depth !== false;
  const samples = o.samples > 1 ? Math.floor(o.samples) : 1;
  const minMag = o.minMag || gl.LINEAR, wrap = o.wrap || gl.CLAMP_TO_EDGE;
  const attachments = [], kinds = [], multisample = samples > 1 ? [] : null;
  let float = false, float32 = false;
  if (hasColor) {
    const n = names ? names.length : 1;
    for (let i = 0; i < n; i++) {
      const asked = (byFormat && o.color[names[i]]) || base;
      const type = asked === gl.FLOAT || asked === gl.HALF_FLOAT ? asked : gl.UNSIGNED_BYTE;
      const internalFormat = type === gl.FLOAT ? gl.RGBA32F : type === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
      if (type !== gl.UNSIGNED_BYTE) float = true;
      if (type === gl.FLOAT) float32 = true;
      attachments.push({ attachmentPoint: gl.COLOR_ATTACHMENT0 + i, internalFormat, format: gl.RGBA, type, minMag, wrap });
      kinds.push('texture');
      if (multisample) multisample.push({ attachmentPoint: gl.COLOR_ATTACHMENT0 + i, format: internalFormat, samples });
    }
  }
  if (hasDepth) {
    if (depthTexture) {
      attachments.push({
        attachmentPoint: gl.DEPTH_ATTACHMENT,
        internalFormat: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT,
        minMag: gl.NEAREST, wrap,
      });
      kinds.push('texture');
      // the blit into the depth texture needs the same depth format on both sides
      if (multisample) multisample.push({ attachmentPoint: gl.DEPTH_ATTACHMENT, format: gl.DEPTH_COMPONENT24, samples });
    } else if (multisample) {
      multisample.push({ attachmentPoint: gl.DEPTH_STENCIL_ATTACHMENT, format: gl.DEPTH24_STENCIL8, samples });
    } else {
      attachments.push({ format: gl.DEPTH_STENCIL });   // a renderbuffer: 24-bit depth
      kinds.push('renderbuffer');
    }
  }
  return { attachments, kinds, multisample, samples, names: names || [], color: hasColor, depthTexture: hasDepth && depthTexture, float, float32 };
}

/**
 * The options `targetSpecs` takes, from the spec `idiom` states. The public
 * shape's two meanings are kept apart: `{ depth: true }` is a depth texture
 * alone, and the default — no option — is a colour target with a depth-stencil
 * renderbuffer, which the spec's `'renderbuffer'` states. Reading the default
 * as `depth: true` would take the colour attachment away.
 * @ignore
 */
function _optsFromSpec(spec) {
  const byFormat = spec.perColor && spec.names.length > 0;
  const depth = spec.depth;                    // 'none' | 'renderbuffer' | 'texture'
  return {
    width: spec.width,
    height: spec.height,
    depth: depth === 'none' ? false : (depth === 'texture' && !spec.color ? true : undefined),
    depthTexture: depth === 'texture' && !!spec.color,
    color: spec.color ? (byFormat ? spec.perColor : (spec.names.length ? spec.names.slice() : undefined)) : false,
    format: spec.format,
    float: spec.float,
    minMag: spec.minMag,
    wrap: spec.wrap,
    samples: spec.samples > 1 ? spec.samples : 1,
  };
}

// ── The values a program already holds ───────────────────────────────────
// A numeric uniform whose value did not change is not uploaded again: the draw
// policy writes the six declared transforms on every call, and two of them —
// `uViewMatrix` and `uProjectionMatrix` — are pass-scope, identical for every
// object of a pass. GL keeps a program's uniform state until something writes
// it, so the second write of the same value is pure cost.
//
// The record is per program, and cleared by `bind`, which uploads the
// application's own bag through twgl beside this member's path. A sampler, a
// texture and anything else non-numeric is never memoised. The limit: a uniform
// written by the application's own `gl.uniform*` call is outside both paths, so
// a figure that writes one that way must go through `bind` or re-establish it —
// `bind` and this member are where the reference documents a value going in.

const _held = new WeakMap();

const _isNumeric = (v) => typeof v === 'number'
  || (v != null && typeof v === 'object' && typeof v.length === 'number'
    && (ArrayBuffer.isView(v) || (Array.isArray(v) && typeof v[0] === 'number')));

/**
 * Whether the program already holds this value, recording it either way.
 * @param {object} prog  A twgl programInfo.
 * @param {string} name  The uniform's name.
 * @param {number|ArrayLike<number>} v  The value about to be uploaded.
 * @returns {boolean} True when the value is the one last uploaded under `name`.
 * @ignore
 */
function _holds(prog, name, v) {
  let memo = _held.get(prog);
  if (!memo) { memo = new Map(); _held.set(prog, memo); }
  const scalar = typeof v === 'number';
  const n = scalar ? 1 : v.length;
  let slot = memo.get(name);
  if (!slot || slot.scalar !== scalar || slot.data.length !== n) {
    slot = { scalar, data: new Float64Array(n) };          // once per name per program
    memo.set(name, slot);
    if (scalar) slot.data[0] = v;
    else for (let i = 0; i < n; i++) slot.data[i] = v[i];
    return false;
  }
  const held = slot.data;
  let same = true;
  if (scalar) {
    same = held[0] === v;
    held[0] = v;
  } else {
    for (let i = 0; i < n; i++) {
      if (held[i] !== v[i]) { same = false; held[i] = v[i]; }
    }
  }
  return same;
}

/**
 * Forget the values a program holds — what `bind` calls, because it uploads the
 * application's bag through the thin layer, out of this member's sight.
 * @param {object} prog  A twgl programInfo.
 * @ignore
 */
export function invalidateUniforms(prog) {
  _held.delete(prog);
}

// ── The vertex arrays a program and a geometry already agree on ───────────
// Binding a geometry walks its attributes — a `vertexAttribPointer` each — and
// disables what the program declares and the geometry lacks. twgl has the cache
// for it (a vertex array object over one program and one geometry); this keeps
// one entry per pair, so the second node of a program over the same geometry
// binds one object instead. The entry dies when the geometry's buffers are
// rebuilt, which is `updateBuffer`'s rebuild path — an in-place `writeBuffer`
// leaves every pointer it recorded valid, so a stream keeps its array.

const _arrays = new WeakMap();

/** The vertex array a program and a geometry share, made on first use. @ignore */
function _arrayFor(gl, prog, geometry) {
  if (!geometry || !geometry.attribs || geometry.vertexArrayObject) return null;
  let byProgram = _arrays.get(geometry);
  if (!byProgram) { byProgram = new Map(); _arrays.set(geometry, byProgram); }
  let va = byProgram.get(prog);
  if (!va) { va = createVertexArrayInfo(gl, [prog], geometry); byProgram.set(prog, va); }
  return va;
}

/**
 * Forget a geometry's vertex arrays — the buffers they point at are gone.
 * @param {WebGL2RenderingContext} gl
 * @param {object} geometry  A twgl bufferInfo.
 * @ignore
 */
export function forgetVertexArrays(gl, geometry) {
  const byProgram = _arrays.get(geometry);
  if (!byProgram) return;
  for (const va of byProgram.values()) if (va.vertexArrayObject && gl.deleteVertexArray) gl.deleteVertexArray(va.vertexArrayObject);
  _arrays.delete(geometry);
}

// ── The backend ──────────────────────────────────────────────────────────

/**
 * The twgl backend for one context.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} The backend `idiom`'s context record holds.
 * @ignore
 */
export function createBackend(gl) {
  // The readback's pending fences: alive only while a read is outstanding.
  const _pending = (ctx) => {
    if (!ctx.readbacks) ctx.readbacks = { list: [], pool: [], polling: false };
    return ctx.readbacks;
  };

  const _vp = [0, 0, 0, 0];
  // The blend modes by name: [srcRGB, dstRGB] factors, resolved on the context.
  const BLEND = {
    NORMAL: [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA],
    ADD: [gl.ONE, gl.ONE],
    MULTIPLY: [gl.DST_COLOR, gl.ZERO],
  };
  const _poll = (ctx) => {
    const rb = _pending(ctx);
    const raf = ctx.raf || ((cb) => requestAnimationFrame(cb));
    const step = () => {
      rb.polling = false;
      if (typeof gl.isContextLost === 'function' && gl.isContextLost()) {
        for (const r of rb.list) r.reject(new Error('[webgl.tree] readPixel: the context was lost.'));
        rb.list.length = 0;
        return;
      }
      for (let i = rb.list.length - 1; i >= 0; i--) {
        const r = rb.list[i];
        const status = gl.clientWaitSync(r.sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) continue;
        rb.list.splice(i, 1);
        gl.deleteSync(r.sync);
        if (status === gl.WAIT_FAILED) { rb.pool.push(r.pbo); r.reject(new Error('[webgl.tree] readPixel: the fence failed.')); continue; }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, r.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, r.out);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        rb.pool.push(r.pbo);
        r.resolve(r.out);
      }
      if (rb.list.length && !rb.polling) { rb.polling = true; raf(step); }
    };
    if (!rb.polling) { rb.polling = true; raf(step); }
  };

  const backend = {
    // The per-API conventions, stated once.
    ndcZMin: WEBGL,
    uvOrientation: 'bottom-up',
    framebufferY: 'up',
    format: 'RGBA8',

    // ── targets ──────────────────────────────────────────────────────────
    /**
     * Create a render target: twgl's framebufferInfo, extended with `.color`,
     * `.depth`, one property per named attachment, `.width` / `.height`,
     * `resize(w, h)` and `resolve()`; `idiom` adds `dispose()`.
     */
    createTarget(ctx, spec) {
      const o = _optsFromSpec(spec);
      const s = targetSpecs(gl, o.samples > 1 ? Object.assign({}, o, { samples: Math.min(o.samples, gl.getParameter(gl.MAX_SAMPLES) || 1) }) : o);
      if (s.float && !ctx.floatExt) {
        ctx.floatExt = gl.getExtension('EXT_color_buffer_float') || false;
        if (!ctx.floatExt) console.error('[webgl.tree] renderTarget: EXT_color_buffer_float is unavailable; a float target will be incomplete.');
      }
      if (s.float32 && (o.minMag || gl.LINEAR) === gl.LINEAR && ctx.floatLinearExt === undefined) {
        ctx.floatLinearExt = gl.getExtension('OES_texture_float_linear') || false;
        if (!ctx.floatLinearExt) console.error('[webgl.tree] renderTarget: OES_texture_float_linear is unavailable; a gl.FLOAT target sampled linearly reads black — use gl.HALF_FLOAT or minMag: gl.NEAREST.');
      }
      const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const width = o.width || gl.drawingBufferWidth, height = o.height || gl.drawingBufferHeight;
      const colors = s.color ? Math.max(1, s.names.length) : 0;
      const fbo = createFramebufferInfo(gl, s.attachments, width, height);
      const ms = s.multisample ? createFramebufferInfo(gl, s.multisample, width, height) : null;
      if (s.names.length > 1) {
        const all = s.names.map((_, i) => gl.COLOR_ATTACHMENT0 + i);
        for (const f of ms ? [fbo, ms] : [fbo]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.framebuffer); gl.drawBuffers(all); }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);

      // the sampleable side; for a multisampled target, draws go to ms and resolve() fills these textures
      const resolved = ms ? { framebuffer: fbo.framebuffer, attachments: fbo.attachments, width, height } : fbo;
      if (ms) fbo.framebuffer = ms.framebuffer;
      fbo.resolved = resolved;
      fbo.kinds = s.kinds;
      fbo.ms = ms;

      const wire = () => {
        const a = resolved.attachments;
        fbo.attachments = a;
        fbo.width = resolved.width;
        fbo.height = resolved.height;
        fbo.color = s.color ? a[0] : null;
        fbo.depth = s.depthTexture ? a[a.length - 1] : null;
        s.names.forEach((n, i) => { fbo[n] = a[i]; });
      };
      wire();

      // one draw-buffer list per colour attachment, built once: resolve() writes one attachment at a time
      const only = [];
      for (let i = 0; i < colors; i++) only.push(Array.from({ length: i + 1 }, (_, k) => (k === i ? gl.COLOR_ATTACHMENT0 + i : gl.NONE)));
      const all = only.length ? Array.from({ length: colors }, (_, i) => gl.COLOR_ATTACHMENT0 + i) : null;

      /** Blit the multisampled renderbuffers into the textures; a single-sampled target has nothing to do. */
      fbo.resolve = () => {
        if (!ms) return fbo;
        const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        const w = fbo.width, h = fbo.height;
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved.framebuffer);
        for (let i = 0; i < colors; i++) {
          gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
          gl.drawBuffers(only[i]);
          gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }
        if (s.depthTexture) gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        if (all) { gl.drawBuffers(all); gl.readBuffer(gl.COLOR_ATTACHMENT0); }
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
        return fbo;
      };
      /** Resize every attachment; the textures stay the same objects. */
      fbo.resize = (w, h) => {
        if (ms) {
          resizeFramebufferInfo(gl, resolved, s.attachments, w, h);
          resizeFramebufferInfo(gl, ms, s.multisample, w, h);
          resolved.width = w; resolved.height = h;
          fbo.framebuffer = ms.framebuffer;
        } else {
          resizeFramebufferInfo(gl, fbo, s.attachments, w, h);
        }
        wire();
        return fbo;
      };
      return fbo;
    },

    /** Delete a target's attachments and framebuffers. The layer forgets it. */
    destroyTarget(ctx, target) {
      const resolved = target.resolved || target;
      const kinds = target.kinds || [];
      (resolved.attachments || []).forEach((a, i) => {
        if (kinds[i] === 'renderbuffer') gl.deleteRenderbuffer(a);
        else gl.deleteTexture(a);
      });
      gl.deleteFramebuffer(resolved.framebuffer);
      if (target.ms) {
        for (const a of target.ms.attachments || []) gl.deleteRenderbuffer(a);
        gl.deleteFramebuffer(target.ms.framebuffer);
      }
      target.ms = null;
      target.resolved = null;
      target.color = null;
      target.depth = null;
    },

    /** Bind a target, or ask which one is bound: the prior binding is the answer. */
    bindTarget(ctx, target) {
      const prior = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      if (target === undefined) return prior;
      if (target && target.framebuffer !== undefined) bindFramebufferInfo(gl, target);
      else gl.bindFramebuffer(gl.FRAMEBUFFER, target || null);
      return prior;
    },

    /** Clear the bound target to a colour, leaving the context's own clear colour as it was. */
    clear(ctx, color) {
      const prior = gl.getParameter(gl.COLOR_CLEAR_VALUE);
      const c = color || [0, 0, 0, 1];
      gl.clearColor(c[0], c[1], c[2], c[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (prior) gl.clearColor(prior[0], prior[1], prior[2], prior[3]);
    },

    // ── programs ─────────────────────────────────────────────────────────
    /** Compile a fullscreen-pass program from its fragment stage; `opts` is twgl's, which takes none. */
    createProgram(ctx, frag, opts) {
      return createProgramInfo(gl, [PASS_VERT, frag]) || null;
    },

    /** The flat colour / texture program `image`, `pane` and the pick pass draw with. */
    imageProgram(ctx) {
      if (!ctx.imageProgram) ctx.imageProgram = createProgramInfo(gl, [FLAT_VERT, FLAT_FRAG]);
      return ctx.imageProgram;
    },

    /** The uniform names a program declares — what lets the layer fill only what it declares. */
    uniformsOf(prog) {
      return prog && prog.uniformSetters ? Object.keys(prog.uniformSetters) : [];
    },

    /** The sampler names a program declares, read once per program. */
    samplersOf(prog) {
      return samplersOf(gl, prog);
    },

    /**
     * Upload a bag by name, binding the program first: twgl's setters upload to
     * whatever program is current, and a value applies to the draw that follows.
     *
     * A numeric value the program already holds is **not** uploaded again — a
     * pass-scope matrix is the same for every object of a pass, and GL keeps it
     * per program until something writes it. Samplers and every non-numeric
     * value still travel on each call: a texture unit is context state, not
     * program state. `bind` uploads the application's own bag beside this
     * member, so it clears the record (`invalidateUniforms`).
     */
    setUniforms(ctx, prog, values) {
      if (!prog || !prog.program) return prog;
      gl.useProgram(prog.program);
      if (!values) return prog;
      const setters = prog.uniformSetters || {};
      let rest = null;
      for (const name in values) {
        const v = values[name];
        const setter = setters[name];
        if (!setter) continue;                              // not this program's name
        if (!_isNumeric(v)) { (rest || (rest = {}))[name] = v; continue; }
        if (!_holds(prog, name, v)) setter(v);
      }
      if (rest) setUniforms(prog, rest);                     // twgl's own path for textures and the rest
      return prog;
    },

    // ── draws ────────────────────────────────────────────────────────────
    /** Copy V and P onto the record and recompute P · V, where the draw policy reads them. */
    setCamera(ctx, V, P) {
      for (let i = 0; i < 16; i++) { ctx.V[i] = V[i]; ctx.P[i] = P[i]; }
      mat4Mul(ctx.PV, ctx.P, ctx.V);
    },

    /**
     * Bind a geometry to the program a bind left bound and draw it — through the
     * vertex array the pair already shares, where there is one.
     */
    draw(ctx, prog, geometry, opts) {
      if (!prog || !prog.program) return null;
      const va = _arrayFor(gl, prog, geometry);
      bindGeometry(gl, prog, va || geometry);
      const o = opts || {};
      drawBufferInfo(gl, va || geometry, o.mode, o.count, o.offset);
      return geometry;
    },

    /** The same, with an instance count. */
    drawInstanced(ctx, prog, geometry, count, opts) {
      if (!prog || !prog.program) return null;
      const va = _arrayFor(gl, prog, geometry);
      bindGeometry(gl, prog, va || geometry);
      const o = opts || {};
      drawBufferInfo(gl, va || geometry, o.mode, o.count, o.offset, count);
      return geometry;
    },

    // ── buffers ──────────────────────────────────────────────────────────
    /** A geometry from the arrays shape, under the names the layer resolved. */
    createBuffer(ctx, arrays, opts) {
      return createBufferInfoFromArrays(gl, arrays);
    },

    /** Refresh a geometry from its arrays shape; a changed attribute set is rebuilt. */
    updateBuffer(ctx, geometry, arrays, opts) {
      const keys = Object.keys(arrays);
      const same = !geometry.vertexArrayObject && keys.every((k) => (k === 'indices' ? !!geometry.indices : !!(geometry.attribs && geometry.attribs[k])));
      if (!same) {
        forgetVertexArrays(gl, geometry);                     // the pointers go with the buffers
        for (const a of Object.values(geometry.attribs || {})) if (a.buffer) gl.deleteBuffer(a.buffer);
        if (geometry.indices) gl.deleteBuffer(geometry.indices);
        Object.assign(geometry, createBufferInfoFromArrays(gl, arrays));
        return geometry;
      }
      return backend.writeBuffer(ctx, geometry, arrays);
    },

    /**
     * Rewrite a geometry's own buffers, in place — the form a stream uses. The
     * shape is the geometry's: an attribute it does not carry is named once and
     * skipped, and a count that outgrew the buffer is `updateBuffer`'s business.
     */
    writeBuffer(ctx, geometry, arrays) {
      for (const key in arrays) {
        const a = arrays[key];
        const data = a && typeof a === 'object' && a.data !== undefined ? a.data : a;
        if (key === 'indices') {
          if (geometry.indices) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indices);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
          }
          continue;
        }
        const attrib = geometry.attribs && geometry.attribs[key];
        if (attrib) setAttribInfoBufferFromArray(gl, attrib, data);
      }
      return geometry;
    },

    // ── picking ──────────────────────────────────────────────────────────
    /**
     * Read one pixel of a target back asynchronously: into a pooled PBO, fenced,
     * and polled on the bridge's own frame loop — alive only while reads are
     * pending. The target is resolved first, and the binding and the viewport it
     * found are its own again afterwards.
     */
    readPixels(ctx, target, x, y) {
      const rb = _pending(ctx);
      const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const vp = gl.getParameter(gl.VIEWPORT);
      _vp[0] = vp[0]; _vp[1] = vp[1]; _vp[2] = vp[2]; _vp[3] = vp[3];
      // a multisampled target is read from its resolved textures
      const fbo = target && typeof target.resolve === 'function' ? target.resolve().resolved : target;
      if (fbo && fbo.framebuffer !== undefined) bindFramebufferInfo(gl, fbo);
      else gl.bindFramebuffer(gl.FRAMEBUFFER, fbo || null);
      const pbo = rb.pool.pop() || gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, 4, gl.STREAM_READ);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
      gl.viewport(_vp[0], _vp[1], _vp[2], _vp[3]);
      return new Promise((resolve, reject) => {
        rb.list.push({ sync, pbo, out: new Uint8Array(4), resolve, reject });
        _poll(ctx);
      });
    },

    // ── textures ─────────────────────────────────────────────────────────
    /** Create a texture from an element, a bitmap or raw pixels, in GL's bottom-up space. */
    createTexture(ctx, source, opts) {
      const o = opts || {};
      let tex;
      if (_isPixels(source)) {
        tex = _pixelTexture(gl, ctx, source, o);
        ctx.sizes.set(tex, [source.width, source.height]);
      } else {
        const spec = _optsOf(gl, o);
        spec.src = _isBitmap(source) ? _viaCanvas(source) : source;
        spec.flipY = 1;
        tex = createTexture(gl, spec);
        const size = _sizeOf(source);
        if (size) ctx.sizes.set(tex, size);
      }
      if (!ctx.textures) ctx.textures = new Set();
      ctx.textures.add(tex);
      return tex;
    },

    /** Refresh a texture from an element — a video or camera frame each frame. */
    uploadTexture(ctx, tex, source) {
      setTextureFromElement(gl, tex, _isBitmap(source) ? _viaCanvas(source) : source, { flipY: 1, auto: false });
      const size = _sizeOf(source);
      if (size) ctx.sizes.set(tex, size);
      return tex;
    },

    /** Delete a texture and forget its size. */
    destroyTexture(ctx, tex) {
      gl.deleteTexture(tex);
      ctx.sizes.delete(tex);
      if (ctx.textures) ctx.textures.delete(tex);
    },

    /** A texture's [width, height], as `filter` reads it for `uTexelSize`. */
    textureSize(ctx, tex) {
      return ctx.sizes.get(tex) || null;
    },

    // ── state ────────────────────────────────────────────────────────────
    /** Set the viewport, or ask for it: `[x, y, w, h]` is the answer either way. */
    setViewport(ctx, rect) {
      const prior = gl.getParameter(gl.VIEWPORT);
      if (rect === undefined) return prior;
      gl.viewport(rect[0], rect[1], rect[2], rect[3]);
      return prior;
    },

    /**
     * Set the depth test, the colour mask and the blend, or ask for them. The
     * token carries what it touched — the depth always, the mask and the blend
     * only where the call named them — so a restore is the token handed back.
     */
    setState(ctx, state) {
      const prior = { depth: gl.isEnabled(gl.DEPTH_TEST) };
      if (state === undefined) return prior;
      if (state.depth !== undefined) {
        if (state.depth) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
      }
      if (state.mask) {
        prior.mask = gl.getParameter(gl.COLOR_WRITEMASK);
        gl.colorMask(state.mask[0], state.mask[1], state.mask[2], state.mask[3]);
      }
      if (state.blend) {
        if (typeof state.blend === 'string') {
          prior.blend = {
            on: gl.isEnabled(gl.BLEND),
            src: gl.getParameter(gl.BLEND_SRC_RGB), dst: gl.getParameter(gl.BLEND_DST_RGB),
            srcA: gl.getParameter(gl.BLEND_SRC_ALPHA), dstA: gl.getParameter(gl.BLEND_DST_ALPHA),
          };
          const f = BLEND[state.blend];
          if (f) { gl.enable(gl.BLEND); gl.blendFunc(f[0], f[1]); }
        } else {                                    // a token: the blend it found
          const b = state.blend;
          if (b.on) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
          gl.blendFuncSeparate(b.src, b.dst, b.srcA, b.dstA);
        }
      }
      return prior;
    },

    // ── context ──────────────────────────────────────────────────────────
    /** Free what the backend made: the fullscreen geometry, the flat program, textures, pending reads. */
    dispose(ctx) {
      if (ctx.quad) {
        forgetVertexArrays(gl, ctx.quad);
        for (const a of Object.values(ctx.quad.attribs || {})) if (a.buffer) gl.deleteBuffer(a.buffer);
        if (ctx.quad.indices) gl.deleteBuffer(ctx.quad.indices);
        ctx.quad = null;
      }
      if (ctx.imageProgram) {
        if (ctx.imageProgram.program && typeof gl.deleteProgram === 'function') gl.deleteProgram(ctx.imageProgram.program);
        ctx.imageProgram = null;
      }
      if (ctx.textures) {
        for (const t of ctx.textures) gl.deleteTexture(t);
        ctx.textures = null;
      }
      if (ctx.readbacks) {
        for (const r of ctx.readbacks.list) {
          if (typeof gl.deleteSync === 'function') gl.deleteSync(r.sync);
          r.reject(new Error('[webgl.tree] readPixel: the context was disposed.'));
        }
        for (const b of ctx.readbacks.pool) if (typeof gl.deleteBuffer === 'function') gl.deleteBuffer(b);
        ctx.readbacks = null;
      }
    },

    // ── the bridge's own, beyond the interface ───────────────────────────
    /** The line pipe's program: aPosition, optional aColor, uPV, uModel, uColor. */
    lineProgram(ctx) {
      if (!ctx.programs.line) ctx.programs.line = createProgramInfo(gl, [LINE_VERT, LINE_FRAG]);
      return ctx.programs.line;
    },

    /** The wide line's program: each segment as a window-space quad of uWidth pixels. */
    wideLineProgram(ctx) {
      if (!ctx.programs.wide) ctx.programs.wide = createProgramInfo(gl, [WIDE_VERT, LINE_FRAG]);
      return ctx.programs.wide;
    },

    /** A cube map from six sources in GL's face order (+X, −X, +Y, −Y, +Z, −Z), unflipped. */
    createCubemap(ctx, faces, opts) {
      const o = opts || {};
      const spec = _optsOf(gl, o);
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
    },
  };

  return backend;
}
