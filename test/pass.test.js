/**
 * @file pass tests — the pure parts: the rect matrix, the pass entry shape,
 *       the constants. Rendering is the browser harness's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mat4MulPoint } from '@nakednous/tree';
import { rectMatrix, passOf, RED, RGB, NORMAL, ADD, MULTIPLY } from '../src/index.js';

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
