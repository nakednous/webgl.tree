/**
 * @file gizmo tests — the pipe's capacity contract on a buffer stub: a
 *       generator's count sizes the buffer once, growth re-allocates,
 *       steady state re-uploads only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axesLines, capacityOf, createArrays } from '@nakednous/tree';
import { fill, expand, contextOf } from '../src/index.js';
import { createGL } from './gl.js';

test('fill: sizes the buffer from the generator, grows on demand, re-uploads in steady state', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  const g = { arrays: createArrays(4, { color: true }), buffer: null, capacity: 0 };
  let size = 100;
  const gen = (a) => axesLines(a, { size });                // 24 vertices with the default bits: three half-axes and the glyphs
  assert.equal(fill(gl, g, gen), 24);
  assert.equal(capacityOf(g.arrays), 24);                   // grown from 4 to the count
  assert.equal(g.capacity, 24);
  const creates = gl.log.filter((e) => e[0] === 'createBuffer').length;
  assert.equal(creates, 2);                                 // position and colour
  const uploads0 = gl.log.filter((e) => e[0] === 'bufferData').length;
  size = 50;
  assert.equal(fill(gl, g, gen), 24);
  assert.equal(gl.log.filter((e) => e[0] === 'createBuffer').length, 2);   // no re-allocation
  assert.equal(gl.log.filter((e) => e[0] === 'bufferData').length, uploads0 + 2);   // both arrays re-uploaded
  assert.equal(g.arrays.position.data[0], 1.04 * 50);       // the new geometry landed
  assert.equal(fill(gl, g, (a) => axesLines(a, { bits: 0 })), 0);   // nothing to draw: nothing uploaded
  assert.equal(gl.log.filter((e) => e[0] === 'bufferData').length, uploads0 + 2);
  assert.equal(Object.keys(ctx.gizmos).length, 0);          // a standalone entry: the registry untouched
});

test('expand: four vertices and six indices per segment, endpoints and colours copied, grown like the raw buffer', () => {
  const gl = createGL();
  const g = { arrays: createArrays(4, { color: true }), buffer: null, capacity: 0, wide: null };
  fill(gl, g, (a) => axesLines(a, { size: 10, bits: 1 }));   // X only: one segment (0,0,0) → (10,0,0), red
  const w = expand(gl, g);
  assert.equal(w.segments, 1);
  assert.deepEqual(Array.from(w.A.slice(0, 12)), [0,0,0, 0,0,0, 0,0,0, 0,0,0]);
  assert.deepEqual(Array.from(w.B.slice(0, 12)), [10,0,0, 10,0,0, 10,0,0, 10,0,0]);
  assert.deepEqual(Array.from(w.T.slice(0, 4)), [0, 0, 1, 1]);
  assert.deepEqual(Array.from(w.S.slice(0, 4)), [-1, 1, -1, 1]);
  assert.deepEqual(Array.from(w.indices.slice(0, 6)), [0, 1, 2, 1, 3, 2]);
  assert.deepEqual(Array.from(w.color.slice(0, 4)), [1, 0, 0, 1]);
  const cap = w.capacity;
  fill(gl, g, (a) => axesLines(a, { size: 10 }));           // 12 segments: within the first capacity
  assert.equal(expand(gl, g).capacity, cap);
  assert.equal(g.wide.segments, 12);
});
