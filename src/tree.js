/**
 * @file tree for WebGL — @nakednous/tree with the NDC depth convention bound.
 * @module webgl.tree/tree
 * @license AGPL-3.0-only
 *
 * @details
 * Every export of @nakednous/tree, unchanged, except the ones taking ndcZMin:
 * those are wrapped here with WEBGL bound and the parameter dropped, so a
 * WebGL program never names the convention. Nothing is recomputed.
 */

'use strict';

import * as t from '@nakednous/tree';

export * from '@nakednous/tree';

const Z = t.WEBGL;

export function mat4Ortho(out, left, right, bottom, top, near, far, ndcYSign) { return t.mat4Ortho(out, left, right, bottom, top, near, far, Z, ndcYSign); }
export function mat4Persp(out, left, right, bottom, top, near, far, ndcYSign) { return t.mat4Persp(out, left, right, bottom, top, near, far, Z, ndcYSign); }
export function mat4Bias(out) { return t.mat4Bias(out, Z); }
export function mat4Viewport(out, vp) { return t.mat4Viewport(out, vp, Z); }
export function cameraProj(out, cam, aspect, ndcYSign) { return t.cameraProj(out, cam, aspect, Z, ndcYSign); }
export function cameraFromMat4(cam, E, P) { return t.cameraFromMat4(cam, E, P, Z); }
export function frustumCorners(out24, cam, aspect) { return t.frustumCorners(out24, cam, aspect, Z); }
export function projNear(p) { return t.projNear(p, Z); }
export function projLeft(p) { return t.projLeft(p, Z); }
export function projRight(p) { return t.projRight(p, Z); }
export function projTop(p) { return t.projTop(p, Z); }
export function projBottom(p) { return t.projBottom(p, Z); }
export function pixelRatio(proj, vpH, eyeZ) { return t.pixelRatio(proj, vpH, eyeZ, Z); }
export function mapLocation(out, px, py, pz, from, to, m, vp) { return t.mapLocation(out, px, py, pz, from, to, m, vp, Z); }
export function mapDirection(out, dx, dy, dz, from, to, m, vp) { return t.mapDirection(out, dx, dy, dz, from, to, m, vp, Z); }
export function unproject(outO, outD, sx, sy, m, vp) { return t.unproject(outO, outD, sx, sy, m, vp, Z); }
export function pointerHit(px, py, x, y, z, radius, m, vp, shape) { return t.pointerHit(px, py, x, y, z, radius, m, vp, Z, shape); }
