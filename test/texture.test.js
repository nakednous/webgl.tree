/**
 * @file texture.test.js — the pixel path: the format a source asks for, the
 * row order it lands in, and the radiance a float texture keeps.
 * @license AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGL } from './gl.js';
import { texture } from '../src/texture.js';
import { contextOf } from '../src/context.js';

// The texImage2D call twgl made, in its own argument order.
const upload = (gl) => {
  const call = [...gl.log].reverse().find((l) => l[0] === 'texImage2D');
  assert.ok(call, 'a texImage2D reached the context');
  return {
    target: call[1], level: call[2], internalFormat: call[3], width: call[4], height: call[5],
    format: call[7], type: call[8], src: call[9],
  };
};

test('texture: a byte array is RGBA8, as it always was', () => {
  const gl = createGL();
  const data = new Uint8Array(2 * 2 * 4);
  texture(gl, { data, width: 2, height: 2 }, { minMag: gl.NEAREST });
  const call = upload(gl);
  assert.equal(call.internalFormat, gl.RGBA8);
  assert.equal(call.format, gl.RGBA);
  assert.equal(call.type, gl.UNSIGNED_BYTE);
  assert.ok(call.src instanceof Uint8Array);
  assert.deepEqual([...call.src], [...data], 'the caller\'s bytes go up, unchanged');
});

test('texture: a Float32Array is RGBA32F with type FLOAT — the pair WebGL2 pairs', () => {
  const gl = createGL();
  const data = new Float32Array(2 * 2 * 4);
  texture(gl, { data, width: 2, height: 2 });
  const call = upload(gl);
  assert.equal(call.internalFormat, gl.RGBA32F, 'radiance needs a float format, not RGBA');
  assert.equal(call.type, gl.FLOAT, 'RGBA32F pairs with FLOAT; UNSIGNED_BYTE would be rejected');
  assert.equal(call.format, gl.RGBA);
});

test('texture: internalFormat and type are the caller\'s where twgl cannot infer', () => {
  const gl = createGL();
  const halves = new Uint16Array(2 * 2 * 4);            // half-floats, laid out by the caller
  texture(gl, { data: halves, width: 2, height: 2 }, { internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT });
  const call = upload(gl);
  assert.equal(call.internalFormat, gl.RGBA16F);
  assert.equal(call.type, gl.HALF_FLOAT);
});

test('texture: flip reverses the rows into GL\'s space, without touching the source', () => {
  const gl = createGL();
  // two rows of two RGBA texels: row 0 is all 1s, row 1 is all 9s
  const data = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9]);
  const before = Uint8Array.from(data);
  texture(gl, { data, width: 2, height: 2 }, { flip: true });
  const call = upload(gl);
  assert.notEqual(call.src, data, 'the upload reads a scratch array, not the caller\'s');
  assert.deepEqual([...call.src.slice(0, 8)], [9, 9, 9, 9, 9, 9, 9, 9], 'row 0 is now the file\'s last row');
  assert.deepEqual([...data], [...before], 'and the caller\'s array is where it was');
});

test('texture: without flip, a pixel source is taken as given', () => {
  const gl = createGL();
  const data = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9]);
  texture(gl, { data, width: 2, height: 2 });
  const call = upload(gl);
  assert.deepEqual([...call.src], [...data], 'no reversal: the bytes are in the order they came');
  assert.deepEqual([...call.src.slice(8, 16)], [9, 9, 9, 9, 9, 9, 9, 9]);
});

test('texture: a flipped Float32Array keeps its precision and its size is recorded', () => {
  const gl = createGL();
  const data = new Float32Array([1.5, 2.5, 3.5, 1, 4.5, 5.5, 6.5, 1]);
  const tex = texture(gl, { data, width: 1, height: 2 }, { flip: true });
  const call = upload(gl);
  assert.ok(call.src instanceof Float32Array);
  assert.deepEqual([...call.src.slice(0, 4)], [4.5, 5.5, 6.5, 1]);
  assert.deepEqual(contextOf(gl).sizes.get(tex), [1, 2], 'filter\'s uTexelSize reads this');
});

test('texture: a float texture sampled linearly is checked against its extension', () => {
  const gl = createGL();
  let asked = null;
  gl.getExtension = (name) => { asked = name; return {}; };
  texture(gl, { data: new Float32Array(4), width: 1, height: 1 });
  assert.equal(asked, 'OES_texture_float_linear', 'the one extension a linear float read needs');
});
