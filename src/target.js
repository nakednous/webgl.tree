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
 * ```
 *
 * @details
 * The returned framebufferInfo carries .color (attachment 0's texture),
 * .depth (the depth texture when sampleable), one property per named
 * attachment, .width / .height, resize(w, h) and dispose(). Passes are
 * routed with twgl's own verb, bindFramebufferInfo(gl, fbo); SCREEN names
 * the default target for readability. Formats: RGBA8, or RGBA16F with
 * { float: true }; a depth texture is DEPTH_COMPONENT24. The bridge tracks
 * no current target — twgl sets the viewport on bind.
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
 * @returns {{ attachments:object[], kinds:string[], names:string[], color:boolean, depthTexture:boolean, float:boolean }}
 */
export function targetSpecs(gl, opts) {
  const o = opts || {};
  const float = !!o.float;
  const names = Array.isArray(o.color) ? o.color.slice() : null;
  const depthOnly = o.depth === true && !names && !o.depthTexture;
  const hasColor = !depthOnly && o.color !== false;
  const depthTexture = !!o.depthTexture || depthOnly;
  const hasDepth = o.depth !== false;
  const attachments = [], kinds = [];
  if (hasColor) {
    const n = names ? names.length : 1;
    for (let i = 0; i < n; i++) {
      attachments.push({
        attachmentPoint: gl.COLOR_ATTACHMENT0 + i,
        internalFormat: float ? gl.RGBA16F : gl.RGBA8, format: gl.RGBA, type: float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        minMag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE,
      });
      kinds.push('texture');
    }
  }
  if (hasDepth) {
    if (depthTexture) {
      attachments.push({
        attachmentPoint: gl.DEPTH_ATTACHMENT,
        internalFormat: gl.DEPTH_COMPONENT24, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT,
        minMag: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE,
      });
      kinds.push('texture');
    } else {
      attachments.push({ format: gl.DEPTH_STENCIL });   // a renderbuffer: 24-bit depth
      kinds.push('renderbuffer');
    }
  }
  return { attachments, kinds, names: names || [], color: hasColor, depthTexture: hasDepth && depthTexture, float };
}

/**
 * Create a render target: a twgl framebufferInfo with `.color`, `.depth`,
 * one property per named attachment, `resize(w, h)` and `dispose()`.
 * @details RGBA8, or RGBA16F with float; a depth texture is
 * DEPTH_COMPONENT24; a plain depth attachment is a renderbuffer.
 * @param {WebGL2RenderingContext} gl
 * @param {{ width?:number, height?:number, depth?:boolean, depthTexture?:boolean,
 *           color?:string[]|false, float?:boolean }} [opts]
 * @returns {object} The framebufferInfo, extended.
 * @example
 * <caption>Axes rendered into a 100 × 75 target and shown at 400 × 300: soft, low-resolution lines.</caption>
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
 * setCamera(gl, tree.createCamera({ eye: [300, 250, 400] }))
 * axes(gl, { size: 100 })
 *
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * image(gl, small.color)
 */
export function renderTarget(gl, opts) {
  const ctx = contextOf(gl);
  const o = opts || {};
  const spec = targetSpecs(gl, o);
  if (spec.float && !ctx.floatExt) {
    ctx.floatExt = gl.getExtension('EXT_color_buffer_float') || false;
    if (!ctx.floatExt) console.error('[twgl.tree] renderTarget: EXT_color_buffer_float is unavailable; a float target will be incomplete.');
  }
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const width = o.width || gl.drawingBufferWidth, height = o.height || gl.drawingBufferHeight;
  const fbo = createFramebufferInfo(gl, spec.attachments, width, height);
  if (spec.names.length > 1) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
    gl.drawBuffers(spec.names.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);

  const wire = () => {
    const a = fbo.attachments;
    fbo.color = spec.color ? a[0] : null;
    fbo.depth = spec.depthTexture ? a[a.length - 1] : null;
    spec.names.forEach((n, i) => { fbo[n] = a[i]; });
    for (let i = 0; i < a.length; i++) if (spec.kinds[i] === 'texture') ctx.sizes.set(a[i], [fbo.width, fbo.height]);
  };
  wire();

  /** Resize every attachment; the textures stay the same objects. */
  fbo.resize = (w, h) => {
    resizeFramebufferInfo(gl, fbo, spec.attachments, w, h);
    wire();
    return fbo;
  };
  /** Delete the attachments and the framebuffer; forget the target. */
  fbo.dispose = () => {
    fbo.attachments.forEach((a, i) => {
      if (spec.kinds[i] === 'texture') { ctx.sizes.delete(a); gl.deleteTexture(a); }
      else gl.deleteRenderbuffer(a);
    });
    gl.deleteFramebuffer(fbo.framebuffer);
    ctx.targets.delete(fbo);
    return fbo;
  };
  ctx.targets.add(fbo);
  return fbo;
}
