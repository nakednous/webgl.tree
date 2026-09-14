/**
 * @file webgl.tree — @nakednous/tree and @nakednous/host on WebGL2 through twgl.
 * @module webgl.tree
 * @license AGPL-3.0-only
 *
 * The render host's ceremony, thinly: every export is a free function taking
 * gl first, with per-context state in a registry keyed by gl. twgl's own
 * verbs (createProgramInfo, createBufferInfoFromArrays, setUniforms,
 * drawBufferInfo, bindFramebufferInfo, gl.clear …) stay the application's;
 * the bridge supplies only what a framework supplies silently — the declared
 * transforms a draw uploads, the camera install, the targets, the passes.
 * @nakednous/tree and @nakednous/host come along as the `tree` and `host`
 * namespaces, so an application imports the stack from one name.
 */

'use strict';

export { init, dispose, contextOf, viewOf } from './context.js';
export { setCamera } from './camera.js';
export { bind, draw, drawInstanced, declaredTransforms, uploadTransforms, TRANSFORMS } from './draw.js';
export { renderTarget, targetSpecs, SCREEN } from './target.js';
export { program, fullscreen, filter, image, pipe, releasePipe, rectMatrix, passOf, RED, GREEN, BLUE, ALPHA, RGB, NORMAL, ADD, MULTIPLY } from './pass.js';
export { fill, expand, axes, grid, hermite, pane, viewFrustum, trackPath, helmRig, handleLocus, beginHUD, endHUD, cross, bullsEye } from './gizmo.js';
export { readPixel, pick } from './pick.js';
export { texture, upload, cubemap } from './texture.js';
export { WEBGL as ndcZMin } from '@nakednous/tree';
export * as tree from '@nakednous/tree';
export * as host from '@nakednous/host';
