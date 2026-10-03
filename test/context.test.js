/**
 * @file context and camera tests — the registry and the camera install
 *       against the gl stub; matrices through tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, cameraView, cameraProj, mat4MulPoint, WEBGL } from '@nakednous/tree';
import { init, dispose, viewOf, setCamera, createCanvas } from '../src/index.js';
import { contextOf } from '../src/context.js';
import { createGL } from './gl.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('context: one entry per gl, created on first use, released by dispose', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  assert.equal(contextOf(gl), ctx);
  assert.equal(ctx.ndcZMin, WEBGL);
  assert.equal(viewOf(gl), ctx.view);
  assert.equal(ctx.view.stale, true);
  ctx.programs.flat = { program: 'P1' };
  let disposed = 0;
  ctx.targets.add({ dispose() { disposed++; } });
  dispose(gl);
  assert.equal(disposed, 1);
  assert.deepEqual(gl.log, [['deleteProgram', 'P1']]);
  assert.notEqual(contextOf(gl), ctx);
  dispose(gl); dispose(createGL());              // unknown contexts: no-ops
});

test('init: attaches a host whose view bag viewOf returns; a null host detaches', () => {
  const gl = createGL();
  const host = { view: { set() {}, stale: true } };
  init(gl, { host });
  assert.equal(viewOf(gl), host.view);
  init(gl, { host: null });
  assert.equal(viewOf(gl), contextOf(gl).view);
});

test('setCamera: the matrix form copies V and P, computes PV, fills the bag and the host', () => {
  const gl = createGL();
  const V = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-5,1]);
  const P = cameraProj(new Float32Array(16), createCamera({ fov: Math.PI / 2, near: 1, far: 100 }), 1, WEBGL);
  const writes = [];
  const host = { view: { set(p, v) { writes.push([p[5], v[14]]); } } };
  const bag = setCamera(gl, V, P, { host });
  assert.equal(bag, host.view);
  const ctx = contextOf(gl);
  assert.equal(ctx.V[14], -5);
  near(ctx.P[5], 1);
  assert.deepEqual(writes, [[1, -5]]);
  V[14] = -9;                                     // copied, not aliased
  assert.equal(ctx.V[14], -5);
  const p = mat4MulPoint([0, 0, 0], ctx.PV, 0, 0, 0);
  near(p[2], mat4MulPoint([0, 0, 0], P, 0, 0, -5)[2]);
  assert.equal(ctx.view.stale, false);
});

test('setCamera: the state form uses the drawing-buffer aspect, keeps P for an unset lens, writes the attached host', () => {
  const gl = createGL({ width: 400, height: 200 });
  const writes = [];
  init(gl, { host: { view: { set(p, v) { writes.push(p[0]); } } } });
  const cam = createCamera({ eye: [0, 0, 10], fov: Math.PI / 2, near: 1, far: 100 });
  setCamera(gl, cam);
  const ctx = contextOf(gl);
  near(ctx.P[0], 0.5);                            // 90° lens at aspect 2
  near(ctx.P[5], 1);
  near(ctx.V[14], -10);
  const E = cameraView(new Float32Array(16), cam);
  for (let i = 0; i < 16; i++) near(ctx.V[i], E[i]);
  setCamera(gl, cam, { aspect: 1 });
  near(ctx.P[0], 1);
  const P = [...ctx.P];
  setCamera(gl, createCamera({ eye: [0, 0, 3], fov: null, halfHeight: null }));
  assert.deepEqual([...ctx.P], P);
  near(ctx.V[14], -3);
  assert.deepEqual(writes, [0.5, 1, 1]);
});

test('setCamera: a bad call logs and leaves the context alone', () => {
  const gl = createGL();
  const errors = [];
  const orig = console.error; console.error = (m) => errors.push(m);
  try { setCamera(gl, [1, 2, 3]); } finally { console.error = orig; }
  assert.equal(errors.length, 1);
  assert.equal(contextOf(gl).V[14], 0);
});

test('createCanvas: the context is sized for the display and its depth compare is stated', () => {
  const gl = createGL();
  const appended = [];
  const el = { style: {} };
  el.getContext = (kind) => { if (kind !== 'webgl2') return null; gl.canvas = el; return gl; };
  const doc = globalThis.document;
  globalThis.document = { createElement: () => el, body: { appendChild: (node) => appended.push(node) } };
  try {
    const out = createCanvas(300, 150, { density: 2 });
    assert.equal(out, gl);
    assert.equal(el.style.width, '300px');
    assert.equal(el.width, 600);
    assert.deepEqual(appended, [el]);
    assert.deepEqual(gl.log, [['depthFunc', gl.LESS]]);   // stated, not inherited
  } finally {
    if (doc === undefined) delete globalThis.document; else globalThis.document = doc;
  }
});
