/**
 * The mappings through the installed camera, and the tree namespace with
 * WebGL's NDC depth convention bound.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as treePkg from '@nakednous/tree';
import { createGL } from './gl.js';
import { setCamera, mapLocation, mapDirection, unproject, fragCoord, pixelRatio, mat4Viewport, tree } from '../src/index.js';

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

function scene() {
  const gl = createGL({ width: 400, height: 300 });
  gl.getParameter = (p) => (p === gl.VIEWPORT ? [0, 0, 400, 300] : null);
  const cam = treePkg.createCamera({ eye: [0, 150, 300], near: 100, far: 1000 });
  setCamera(gl, cam);
  return { gl, cam };
}

test('mapLocation: the center lands mid-viewport, higher points higher on screen (y down)', () => {
  const { gl } = scene();
  const s = mapLocation(gl, [0, 0, 0], 0, 0, 0, treePkg.WORLD, treePkg.SCREEN);
  near(s[0], 200); near(s[1], 150);
  const up = mapLocation(gl, [0, 0, 0], 0, 50, 0, treePkg.WORLD, treePkg.SCREEN);
  assert.ok(up[1] < 150);
  const back = mapLocation(gl, [0, 0, 0], s[0], s[1], s[2], treePkg.SCREEN, treePkg.WORLD);
  near(back[0], 0); near(back[1], 0); near(back[2], 0);
});

test('mapDirection: the eye forward is the gaze in world space', () => {
  const { gl, cam } = scene();
  const d = mapDirection(gl, [0, 0, 0], 0, 0, -1, treePkg.EYE, treePkg.WORLD);
  const g = [-cam.eye[0], -cam.eye[1], -cam.eye[2]], l = Math.hypot(...g);
  near(d[0], g[0] / l); near(d[1], g[1] / l); near(d[2], g[2] / l);
});

// a frame a quarter turn about y, its origin at (50, 0, 0): the local x tip
// lands at world (50, 0, −100), the local x̂ reads world −ẑ
function frame() {
  const q = treePkg.qFromAxisAngle(treePkg.quat(), 0, 1, 0, Math.PI / 2);
  return treePkg.mat4FromTRS(treePkg.mat4(), 50, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1);
}

test('mapLocation: a frame matrix maps between the object frame and the world, both ways', () => {
  const { gl } = scene();
  const M = frame();
  const w = mapLocation(gl, [0, 0, 0], 100, 0, 0, M, treePkg.WORLD);
  near(w[0], 50); near(w[1], 0); near(w[2], -100);
  const back = mapLocation(gl, [0, 0, 0], w[0], w[1], w[2], treePkg.WORLD, M);
  near(back[0], 100); near(back[1], 0); near(back[2], 0);
});

test('mapLocation: a frame composes with the named spaces', () => {
  const { gl } = scene();
  const M = frame();
  const direct = mapLocation(gl, [0, 0, 0], 7, -3, 2, M, treePkg.SCREEN);
  const world = mapLocation(gl, [0, 0, 0], 7, -3, 2, M, treePkg.WORLD);
  const two = mapLocation(gl, [0, 0, 0], world[0], world[1], world[2], treePkg.WORLD, treePkg.SCREEN);
  near(direct[0], two[0]); near(direct[1], two[1]); near(direct[2], two[2]);
});

test('mapDirection: a frame maps directions by its rotation only', () => {
  const { gl } = scene();
  const M = frame();
  const d = mapDirection(gl, [0, 0, 0], 1, 0, 0, M, treePkg.WORLD);
  near(d[0], 0); near(d[1], 0); near(d[2], -1);
  const back = mapDirection(gl, [0, 0, 0], d[0], d[1], d[2], treePkg.WORLD, M);
  near(back[0], 1); near(back[1], 0); near(back[2], 0);
});

test('unproject: the ray under the viewport center passes through the center', () => {
  const { gl } = scene();
  const o = [0, 0, 0], d = [0, 0, 0];
  assert.ok(unproject(gl, o, d, 200, 150));
  const s = -o[1] / d[1];
  near(o[0] + s * d[0], 0); near(o[2] + s * d[2], 0);
});

test('fragCoord: a canvas pixel becomes the drawing-buffer pixel, y up (density 2)', () => {
  const gl = createGL({ width: 800, height: 600 });   // a 400 × 300 canvas on a dense display
  gl.canvas = { clientWidth: 400, clientHeight: 300 };
  const out = fragCoord(gl, [0, 0], 200, 150);        // the canvas centre is the buffer centre
  near(out[0], 400); near(out[1], 300);
  fragCoord(gl, out, 0, 0);                           // the canvas's top-left is the buffer's top
  near(out[0], 0); near(out[1], 600);
  fragCoord(gl, out, 0, 300);                         // its bottom-left, the buffer's bottom
  near(out[0], 0); near(out[1], 0);
});

test('pixelRatio and mat4Viewport read the viewport', () => {
  const { gl } = scene();
  const P = treePkg.cameraProj([], treePkg.createCamera({ eye: [0, 150, 300], near: 100, far: 1000 }), 400 / 300, treePkg.WEBGL);
  near(pixelRatio(gl, -335), treePkg.pixelRatio(P, 300, -335, treePkg.WEBGL), 1e-6);
  assert.deepEqual(Array.from(mat4Viewport(gl, new Float32Array(16))),
    Array.from(treePkg.mat4Viewport(new Float32Array(16), [0, 300, 400, -300], treePkg.WEBGL)));
});

test('tree binds WEBGL and drops the parameter; everything else is tree itself', () => {
  assert.equal(tree.mat4Mul, treePkg.mat4Mul);
  assert.equal(tree.mat4, treePkg.mat4);
  assert.notEqual(tree.mat4Persp, treePkg.mat4Persp);
  assert.deepEqual(Array.from(tree.mat4Persp(new Float32Array(16), -1, 1, -1, 1, 1, 10)),
    Array.from(treePkg.mat4Persp(new Float32Array(16), -1, 1, -1, 1, 1, 10, treePkg.WEBGL)));
  const P = tree.cameraProj(tree.mat4(), tree.createCamera({ near: 2, far: 50 }), 1);
  near(tree.projNear(P), 2); near(tree.projFar(P), 50);
});
