/**
 * @file Render targets — every shape over twgl's framebufferInfo, and SCREEN.
 * @module twgl.tree/target
 * @license AGPL-3.0-only
 *
 * `renderTarget` makes an offscreen target in one call; draw into it with
 * `twgl.bindFramebufferInfo`, and back to the canvas with `SCREEN`.
 *
 * ```
 * renderTarget(gl)                              // canvas-sized, color + depth
 * renderTarget(gl, { width, height })           // sized
 * renderTarget(gl, { depth: true })             // a depth texture only — a shadow map
 * renderTarget(gl, { depthTexture: true })      // color + a sampleable depth texture
 * renderTarget(gl, { color: ['albedo', 'normal', 'position'] })   // a g-buffer
 * renderTarget(gl, { depth: false })            // color only
 * renderTarget(gl, { format: gl.FLOAT })        // RGBA32F; gl.HALF_FLOAT for RGBA16F, 8-bit by default
 * renderTarget(gl, { color: { position: gl.HALF_FLOAT, albedo: gl.UNSIGNED_BYTE } })   // a format per attachment
 * renderTarget(gl, { minMag, wrap })            // sampling; linear and clamp by default
 * renderTarget(gl, { samples: 4 })              // multisampled; fbo.resolve() before sampling it
 * ```
 *
 * @details
 * The returned framebufferInfo carries .color (attachment 0's texture),
 * .depth (the depth texture when sampleable), one property per named
 * attachment, .width / .height, resize(w, h), resolve() and dispose(). Passes
 * are routed with twgl's own verb, bindFramebufferInfo(gl, fbo); SCREEN names
 * the default target for readability. Formats: RGBA8; RGBA16F with
 * format gl.HALF_FLOAT (or float: true); RGBA32F with gl.FLOAT, whose linear
 * sampling needs OES_texture_float_linear; a depth texture is
 * DEPTH_COMPONENT24. The bridge tracks
 * no current target — twgl sets the viewport on bind.
 *
 * A multisampled target draws into multisampled renderbuffers: its
 * .framebuffer is theirs, so bindFramebufferInfo routes draws there, while
 * .color / .depth stay the single-sampled textures of .resolved. resolve()
 * blits the renderbuffers into those textures — colour per attachment,
 * depth when a depth texture exists, so the depth renderbuffer shares the
 * texture's format. pipe and readPixel resolve a target they are handed;
 * a pass that samples .color itself calls resolve() first. A single-sampled
 * target's resolve() does nothing and its .resolved is itself.
 */

'use strict';

import { createFramebufferInfo, resizeFramebufferInfo } from 'twgl.js';
import { contextOf } from './context.js';

/** The default on-screen target: bindFramebufferInfo(gl, SCREEN). */
export const SCREEN = null;

/**
 * Resolve a renderTarget's options into twgl attachment specs.
 * @param {WebGL2RenderingContext} gl  For its constants.
 * @param {object} [opts]
 * @returns {{ attachments:object[], kinds:string[], multisample:object[]|null, samples:number,
 *             names:string[], color:boolean, depthTexture:boolean, float:boolean, float32:boolean }}
 *          attachments / kinds describe the sampleable framebuffer; multisample the
 *          renderbuffers drawn into when samples > 1, else null.
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
 * Create a render target: a twgl framebufferInfo with `.color`, `.depth`,
 * one property per named attachment, `resize(w, h)`, `resolve()` and
 * `dispose()`.
 * @details RGBA8, RGBA16F or RGBA32F per format; a depth texture is
 * DEPTH_COMPONENT24; a plain depth attachment is a renderbuffer. samples is
 * clamped to the context's MAX_SAMPLES.
 * @param {WebGL2RenderingContext} gl
 * @param {{ width?:number, height?:number, depth?:boolean, depthTexture?:boolean,
 *           color?:string[]|Object<string, number>|false, format?:number, float?:boolean,
 *           minMag?:number, wrap?:number, samples?:number }} [opts]
 *        format: gl.UNSIGNED_BYTE (default), gl.HALF_FLOAT or gl.FLOAT; color
 *        as { name: format } sets it per attachment. minMag: the colour
 *        textures' filter (default gl.LINEAR). wrap: every
 *        texture's wrap (default gl.CLAMP_TO_EDGE). samples: > 1 for a
 *        multisampled target (default 1).
 * @returns {object} The framebufferInfo, extended.
 * @example
 * <caption>Axes rendered into a 100 × 75 target and stretched to 400 × 300: the low resolution shows as blocky lines.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, axes, renderTarget, image, SCREEN, tree } from 'twgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const small = renderTarget(gl, { width: 100, height: 75 })
 * twgl.bindFramebufferInfo(gl, small)
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, tree.createCamera({ eye: [129, 107, 172] }))
 * axes(gl, { size: 100 })
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * image(gl, small.color)
 * @example
 * <caption>The same axes in two 100 × 150 targets shown at twice their size: single-sampled on the left with hard stair-steps, samples: 4 and resolved on the right with softened edges.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, axes, renderTarget, image, SCREEN, tree } from 'twgl.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2', { antialias: false })
 *
 * // small targets, magnified with nearest sampling, make each pixel visible
 * const cam = tree.createCamera({ eye: [169, 141, 225] })
 * const plain = renderTarget(gl, { width: 100, height: 150, minMag: gl.NEAREST })
 * const smooth = renderTarget(gl, { width: 100, height: 150, minMag: gl.NEAREST, samples: 4 })
 * for (const target of [plain, smooth]) {
 *   twgl.bindFramebufferInfo(gl, target)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam, { aspect: 100 / 150 })
 *   axes(gl, { size: 100, width: 2 })
 * }
 * smooth.resolve()
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * image(gl, plain.color, { x: 0, y: 0, width: 200, height: 300 })
 * image(gl, smooth.color, { x: 200, y: 0, width: 200, height: 300 })
 */
export function renderTarget(gl, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  const spec = targetSpecs(gl, o.samples > 1 ? Object.assign({}, o, { samples: Math.min(o.samples, gl.getParameter(gl.MAX_SAMPLES) || 1) }) : o);
  if (spec.float && !ctx.floatExt) {
    ctx.floatExt = gl.getExtension('EXT_color_buffer_float') || false;
    if (!ctx.floatExt) console.error('[twgl.tree] renderTarget: EXT_color_buffer_float is unavailable; a float target will be incomplete.');
  }
  if (spec.float32 && (o.minMag || gl.LINEAR) === gl.LINEAR && ctx.floatLinearExt === undefined) {
    ctx.floatLinearExt = gl.getExtension('OES_texture_float_linear') || false;
    if (!ctx.floatLinearExt) console.error('[twgl.tree] renderTarget: OES_texture_float_linear is unavailable; a gl.FLOAT target sampled linearly reads black — use gl.HALF_FLOAT or minMag: gl.NEAREST.');
  }
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const width = o.width || gl.drawingBufferWidth, height = o.height || gl.drawingBufferHeight;
  const colors = spec.color ? Math.max(1, spec.names.length) : 0;
  const fbo = createFramebufferInfo(gl, spec.attachments, width, height);
  const ms = spec.multisample ? createFramebufferInfo(gl, spec.multisample, width, height) : null;
  if (spec.names.length > 1) {
    const all = spec.names.map((_, i) => gl.COLOR_ATTACHMENT0 + i);
    for (const f of ms ? [fbo, ms] : [fbo]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.framebuffer); gl.drawBuffers(all); }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);

  // the sampleable side; for a multisampled target, draws go to ms and resolve() fills these textures
  const resolved = ms ? { framebuffer: fbo.framebuffer, attachments: fbo.attachments, width, height } : fbo;
  if (ms) fbo.framebuffer = ms.framebuffer;
  fbo.resolved = resolved;

  const wire = () => {
    const a = resolved.attachments;
    fbo.attachments = a;
    fbo.width = resolved.width;
    fbo.height = resolved.height;
    fbo.color = spec.color ? a[0] : null;
    fbo.depth = spec.depthTexture ? a[a.length - 1] : null;
    spec.names.forEach((n, i) => { fbo[n] = a[i]; });
    for (let i = 0; i < a.length; i++) if (spec.kinds[i] === 'texture') ctx.sizes.set(a[i], [fbo.width, fbo.height]);
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
    if (spec.depthTexture) gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    if (all) { gl.drawBuffers(all); gl.readBuffer(gl.COLOR_ATTACHMENT0); }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
    return fbo;
  };
  /** Resize every attachment; the textures stay the same objects. */
  fbo.resize = (w, h) => {
    if (ms) {
      resizeFramebufferInfo(gl, resolved, spec.attachments, w, h);
      resizeFramebufferInfo(gl, ms, spec.multisample, w, h);
      resolved.width = w; resolved.height = h;
      fbo.framebuffer = ms.framebuffer;
    } else {
      resizeFramebufferInfo(gl, fbo, spec.attachments, w, h);
    }
    wire();
    return fbo;
  };
  /** Delete the attachments and the framebuffers; forget the target. */
  fbo.dispose = () => {
    resolved.attachments.forEach((a, i) => {
      if (spec.kinds[i] === 'texture') { ctx.sizes.delete(a); gl.deleteTexture(a); }
      else gl.deleteRenderbuffer(a);
    });
    gl.deleteFramebuffer(resolved.framebuffer);
    if (ms) {
      for (const a of ms.attachments) gl.deleteRenderbuffer(a);
      gl.deleteFramebuffer(ms.framebuffer);
    }
    ctx.targets.delete(fbo);
    return fbo;
  };
  ctx.targets.add(fbo);
  return fbo;
}
