/**
 * @file draw tests — the declared-transform table and the upload against a
 *       fake programInfo; the matrices through tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mat4Mul, mat3NormalFromMat4 } from '@nakednous/tree';
import { contextOf, setCamera, declaredTransforms, uploadTransforms, TRANSFORMS } from '../src/index.js';
import { createGL } from './gl.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

function fakeProgram(names) {
  const got = {};
  const setters = {};
  for (const n of names) setters[n] = (v) => { got[n] = Array.from(v); };
  return { program: {}, uniformSetters: setters, got };
}

test('declaredTransforms: reads the six names off the setters, nothing else', () => {
  assert.deepEqual(declaredTransforms({}), { model: false, view: false, mv: false, proj: false, mvp: false, normal: false, any: false });
  const d = declaredTransforms({ uModelViewMatrix: () => {}, uProjectionMatrix: () => {}, uLightMatrix: () => {} });
  assert.equal(d.mv, true); assert.equal(d.proj, true); assert.equal(d.any, true);
  assert.equal(d.model, false);
  assert.equal(TRANSFORMS.length, 6);
});

test('uploadTransforms: each declared transform gets its value; undeclared ones are never set', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  const V = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-5,1]);
  const P = new Float32Array([2,0,0,0, 0,2,0,0, 0,0,-1,-1, 0,0,-2,0]);
  setCamera(gl, V, P);
  const M = new Float32Array([2,0,0,0, 0,2,0,0, 0,0,2,0, 1,0,0,1]);
  const prog = fakeProgram(TRANSFORMS);
  uploadTransforms(ctx, prog, M);
  const MV = mat4Mul(new Float32Array(16), V, M);
  const MVP = mat4Mul(new Float32Array(16), P, MV);
  assert.deepEqual(prog.got.uModelMatrix, Array.from(M));
  assert.deepEqual(prog.got.uViewMatrix, Array.from(V));
  for (let i = 0; i < 16; i++) { near(prog.got.uModelViewMatrix[i], MV[i]); near(prog.got.uModelViewProjectionMatrix[i], MVP[i]); }
  const N = mat3NormalFromMat4(new Float32Array(9), MV);
  for (let i = 0; i < 9; i++) near(prog.got.uNormalMatrix[i], N[i]);

  const partial = fakeProgram(['uModelMatrix', 'uLightMatrix']);
  uploadTransforms(ctx, partial, null);
  assert.deepEqual(Object.keys(partial.got), ['uModelMatrix']);
  assert.deepEqual(partial.got.uModelMatrix, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

  const none = fakeProgram(['uColor']);
  uploadTransforms(ctx, none, M);
  assert.deepEqual(none.got, {});
  assert.equal(ctx.declared.get(prog).mvp, true);     // cached per program
});

test('uploadTransforms: with no M the view and PV are uploaded as they are', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  const V = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-5,1]);
  const P = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  setCamera(gl, V, P);
  const prog = fakeProgram(['uModelViewMatrix', 'uModelViewProjectionMatrix']);
  uploadTransforms(ctx, prog, null);
  assert.deepEqual(prog.got.uModelViewMatrix, Array.from(V));
  assert.deepEqual(prog.got.uModelViewProjectionMatrix, Array.from(ctx.PV));
});
