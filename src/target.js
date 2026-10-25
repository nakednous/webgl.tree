/**
 * @file Render targets — every shape over twgl's framebufferInfo, and SCREEN.
 * @module webgl.tree/target
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

import { renderTarget as renderTargetOf } from '@nakednous/idiom';
import { contextOf } from './context.js';

/** The default on-screen target: bindFramebufferInfo(gl, SCREEN). */
export const SCREEN = null;

// The attachment specs the backend resolves a target's shape into: the
// package's own, imported by its tests from here.
export { targetSpecs } from './backend.js';

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
 * const { createCanvas, setCamera, axes, renderTarget, image, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const canvas = gl.canvas
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
 * const { createCanvas, setCamera, axes, renderTarget, image, SCREEN, tree } = webglTree
 *
 * const gl = createCanvas(400, 300, { attributes: { antialias: false } })
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
 * // image draws into the drawing buffer's pixels: scale the panels by the display's density
 * const s = gl.drawingBufferWidth / gl.canvas.clientWidth
 * twgl.bindFramebufferInfo(gl, SCREEN)
 * image(gl, plain.color, { x: 0, y: 0, width: 200 * s, height: 300 * s })
 * image(gl, smooth.color, { x: 200 * s, y: 0, width: 200 * s, height: 300 * s })
 */
export function renderTarget(gl, opts) {
  return renderTargetOf(contextOf(gl), opts);
}
