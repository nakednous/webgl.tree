/**
 * @file draw tests — the declared-transform table and the upload against a
 *       fake programInfo; the matrices through tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mat4Mul, mat3NormalFromMat4 } from '@nakednous/tree';
import { setCamera, buffer } from '../src/index.js';
import { contextOf } from '../src/context.js';
import { declaredTransforms, uploadTransforms, TRANSFORMS } from '../src/draw.js';
import { disableMissingAttributes } from '../src/programs.js';
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

test('buffer: the arrays shape under the bridge\'s attribute names; other keys pass through; joints unnormalised', () => {
  globalThis.WebGLBuffer ??= class WebGLBuffer {};   // twgl tells a ready buffer from arrays by this class
  const gl = createGL();
  const info = buffer(gl, {
    position: { numComponents: 3, data: new Float32Array(9) },
    normal: { numComponents: 3, data: new Float32Array(9) },
    texcoord: { numComponents: 2, data: new Float32Array(6) },
    joints: { numComponents: 4, data: new Uint8Array(12) },
    weights: { numComponents: 4, data: new Float32Array(12) },
    aTarget0: { numComponents: 3, data: new Float32Array(9) },
    indices: { numComponents: 3, data: new Uint32Array([0, 1, 2]) },
  });
  assert.deepEqual(Object.keys(info.attribs).sort(), ['aJoints', 'aNormal', 'aPosition', 'aTarget0', 'aTexCoord', 'aWeights']);
  assert.equal(info.attribs.aJoints.normalize, false);
  assert.equal(info.attribs.aTexCoord.numComponents, 2);
  assert.equal(info.numElements, 3);
  assert.ok(info.indices);
  const raw = buffer(gl, { position: new Float32Array(9), joints: new Uint16Array(12) });   // bare typed arrays
  const mesh = buffer(gl, { position: { numComponents: 3, data: new Float32Array(9) }, normal: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    bounds: { min: [0, 0, 0], max: [1, 1, 0], center: [0.5, 0.5, 0], diag: 1 }, count: 3, labels: [], extra: null });
  assert.deepEqual(Object.keys(mesh.attribs).sort(), ['aNormal', 'aPosition']);   // keys holding no numbers are skipped
  const uv = { numComponents: 2, data: new Float32Array(6) };
  const named = buffer(gl, { position: new Float32Array(9), texcoord: undefined, aUV: uv, aHeat: { numComponents: 1, data: new Float32Array(3) } });
  assert.deepEqual(Object.keys(named.attribs).sort(), ['aHeat', 'aPosition', 'aUV']);   // a key of its own keeps its name; a blanked key is skipped
  assert.equal(named.attribs.aHeat.numComponents, 1);
  assert.equal(raw.attribs.aJoints.numComponents, 4);
  assert.equal(raw.numElements, 3);
});

test('disableMissingAttributes: what the program declares and the buffers lack is disabled; a vertex array object is left alone', () => {
  const gl = createGL();
  const prog = { attribSetters: { aPosition: { location: 0 }, aNormal: { location: 1 }, aTarget0: { location: 2 }, aTarget1: { location: 5 } } };
  const disabled = () => gl.log.filter(e => e[0] === 'disableVertexAttribArray').map(e => e[1]);
  disableMissingAttributes(gl, prog, { attribs: { aPosition: {}, aNormal: {}, aColor: {} } });   // aColor: carried, not declared — nothing to do
  assert.deepEqual(disabled(), [2, 5]);
  gl.log.length = 0;
  disableMissingAttributes(gl, prog, { attribs: { aPosition: {}, aNormal: {}, aTarget0: {}, aTarget1: {} } });
  assert.deepEqual(disabled(), []);
  disableMissingAttributes(gl, prog, { attribs: {}, vertexArrayObject: {} });
  assert.deepEqual(disabled(), []);
});
