/**
 * @file pass tests — the pure parts: the rect matrix, the pass entry shape,
 *       the constants. Rendering is the browser harness's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mat4MulPoint } from '@nakednous/tree';
import { RED, RGB, NORMAL, ADD, MULTIPLY } from '../src/index.js';
import { contextOf } from '../src/context.js';
import { rectMatrix, passOf, filter, samplersOf } from '../src/pass.js';
import { createGL } from './gl.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('rectMatrix: cover is the identity; a quarter rect lands on its NDC corners', () => {
  const m = rectMatrix(new Float32Array(16), 0, 0, 400, 300, 400, 300);
  assert.deepEqual(Array.from(m), [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  rectMatrix(m, 200, 0, 200, 150, 400, 300);          // the bottom-right quarter
  const bl = mat4MulPoint([0, 0, 0], m, -1, -1, 0), tr = mat4MulPoint([0, 0, 0], m, 1, 1, 0);
  near(bl[0], 0); near(bl[1], -1);
  near(tr[0], 1); near(tr[1], 0);
});

test('passOf: a programInfo or { program, uniforms }; anything else is skipped', () => {
  const prog = { program: {}, uniformSetters: {} };
  assert.deepEqual(passOf(prog), { program: prog, uniforms: null });
  assert.deepEqual(passOf({ program: prog, uniforms: { uDir: [1, 0] } }), { program: prog, uniforms: { uDir: [1, 0] } });
  assert.equal(passOf(null), null);
  assert.equal(passOf({}), null);
});

test('constants: masks and blend names', () => {
  assert.deepEqual(RED, [true, false, false, false]);
  assert.deepEqual(RGB, [true, true, true, false]);
  assert.deepEqual([NORMAL, ADD, MULTIPLY], ['NORMAL', 'ADD', 'MULTIPLY']);
});

// ── The input rule (#94): the pass's input reaches the samplers the stage
//    declares and the bag leaves unset. The stub reports a program's uniforms;
//    the setters record what they were handed.

function samplerProgram(names) {
  const got = {};
  const setters = {};
  for (const n of names) setters[n] = (v) => { got[n] = v; };
  return { program: {}, uniformSetters: setters, attributeSetters: {}, got };
}

test('samplersOf: the declared samplers only, base names, read once per program', () => {
  const gl = createGL();
  const prog = samplerProgram(['uScene', 'uDepth']);
  gl.activeUniforms.set(prog.program, [
    { name: 'uScene', type: gl.SAMPLER_2D },
    { name: 'uGain', type: gl.FLOAT },
    { name: 'uDepth[0]', type: gl.SAMPLER_2D },
    { name: 'uSky', type: gl.SAMPLER_CUBE },
  ]);
  let reads = 0;
  const count = gl.getProgramParameter;
  gl.getProgramParameter = (p, pname) => { if (pname === gl.ACTIVE_UNIFORMS) reads++; return count(p, pname); };
  assert.deepEqual(samplersOf(gl, prog), ['uScene', 'uDepth', 'uSky']);
  const read = reads;
  assert.deepEqual(samplersOf(gl, prog), ['uScene', 'uDepth', 'uSky']);
  assert.equal(reads, read, 'the list is cached on the program');
});

test('filter: the input fills every unset sampler; the bag wins where it sets one', () => {
  const gl = createGL();
  const prog = samplerProgram(['uScene', 'uDepth', 'uGain']);
  gl.activeUniforms.set(prog.program, [
    { name: 'uScene', type: gl.SAMPLER_2D },
    { name: 'uDepth', type: gl.SAMPLER_2D },
    { name: 'uGain', type: gl.FLOAT },
  ]);
  const scene = { tex: 'scene' }, depth = { tex: 'depth' };

  filter(gl, prog, null, scene);
  assert.equal(prog.got.uScene, scene);
  assert.equal(prog.got.uDepth, scene, 'a stage reading no second texture is handed the input alone');

  filter(gl, prog, { uDepth: depth }, scene);
  assert.equal(prog.got.uScene, scene);
  assert.equal(prog.got.uDepth, depth, "the bag's own value is not overwritten");

  filter(gl, prog, { uGain: 2 }, scene);
  assert.equal(prog.got.uGain, 2);

  filter(gl, prog, null, { color: scene });                 // a target normalizes to its colour
  assert.equal(prog.got.uScene, scene);
});

test('filter: a declared sampler nobody sets is logged once per program', () => {
  const gl = createGL();
  const prog = samplerProgram(['uScene']);
  gl.activeUniforms.set(prog.program, [{ name: 'uScene', type: gl.SAMPLER_2D }]);
  const errors = [];
  const real = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    filter(gl, prog, null);                                  // no input, no bag value
    filter(gl, prog, null);
  } finally { console.error = real; }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /uScene/);
});

test('filter: uTexelSize is the input\'s own texel, and the bag\'s uSource without an argument', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  const prog = samplerProgram(['uScene', 'uTexelSize']);
  gl.activeUniforms.set(prog.program, [
    { name: 'uScene', type: gl.SAMPLER_2D },
    { name: 'uTexelSize', type: gl.FLOAT },                  // a vec2 reads as FLOAT here; only the name matters
  ]);
  const scene = { tex: 'scene' };
  ctx.sizes.set(scene, [64, 32]);
  filter(gl, prog, null, scene);
  near(prog.got.uTexelSize[0], 1 / 64); near(prog.got.uTexelSize[1], 1 / 32);
  filter(gl, prog, { uSource: scene });                      // the bag form keeps its behaviour
  near(prog.got.uTexelSize[0], 1 / 64);
});

test('filter: returns the bound program, and null where nothing was drawn', () => {
  const gl = createGL();
  const prog = samplerProgram(['uScene']);
  gl.activeUniforms.set(prog.program, [{ name: 'uScene', type: gl.SAMPLER_2D }]);
  assert.equal(filter(gl, prog, null, { tex: 'scene' }), prog);
  gl.depthTest = true;
  assert.equal(filter(gl, null, null), null);
  assert.equal(gl.depthTest, true, 'a failed pass leaves the depth test as it found it');
});
