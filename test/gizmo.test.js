/**
 * @file gizmo tests — the pipe's capacity contract on a buffer stub: a
 *       generator's count sizes the buffer once, growth re-allocates,
 *       steady state re-uploads only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axesLines, capacityOf, createArrays } from '@nakednous/tree';
import { PoseHelm } from '@nakednous/tree';
import { fill, expand, lines, helmRig } from '../src/gizmo.js';
import { contextOf } from '../src/context.js';
import { createGL } from './gl.js';

/** A program record with the setters a draw writes through, as the fake's own. */
function fakeProgram(names) {
  const setters = {};
  for (const n of names) setters[n] = () => {};
  return { program: {}, uniformSetters: setters };
}

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

test('lines: ten numbers a segment, written into one cache and drawn in one call', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  ctx.programs.line = fakeProgram(['uPV', 'uModel', 'uColor', 'uUseColor']);
  const batch = new Float32Array([
    0, 0, 0, 10, 0, 0, 1, 0, 0, 1,                    // a red segment along x
    0, 0, 0, 0, 10, 0, 0, 1, 0, 0.5,                  // a green one along y, half transparent
  ]);
  lines(gl, batch);
  const g = ctx.gizmos.lines;
  assert.equal(g.arrays.count, 4, 'two vertices a segment');
  assert.deepEqual(Array.from(g.arrays.position.data.slice(0, 6)), [0, 0, 0, 10, 0, 0], 'the endpoints in order');
  assert.deepEqual(Array.from(g.arrays.color.data.slice(0, 8)), [1, 0, 0, 1, 1, 0, 0, 1], 'each vertex its segment\'s colour');
  assert.deepEqual(Array.from(g.arrays.color.data.slice(12, 16)), [0, 1, 0, 0.5], 'alpha included');
  assert.equal(gl.log.filter((e) => e[0] === 'drawArrays').length, 1, 'one draw a call');

  // an in-place write a frame, not a second geometry
  const geometry = g.buffer;
  const creates = gl.log.filter((e) => e[0] === 'createBuffer').length;
  batch[6] = 0; batch[7] = 0; batch[8] = 1;
  lines(gl, batch);
  assert.equal(g.buffer, geometry, 'the geometry is reused');
  assert.equal(gl.log.filter((e) => e[0] === 'createBuffer').length, creates);

  // count states the live segments: the tail of the array is not drawn
  gl.log.length = 0;
  lines(gl, batch, { count: 1 });
  assert.equal(g.arrays.count, 2);

  // past the capacity: the geometry is rebuilt from the batch's own count
  const many = new Float32Array(10 * 300);
  lines(gl, many);
  assert.equal(g.arrays.count, 600);
  assert.notEqual(g.buffer, geometry, 'a batch past the capacity rebuilds');
  assert.equal(ctx.gizmos.lines, g, 'one cache a context, not a cache a call');
});

test('lines: the width crosses by the pipe\'s policy, and the state the call found comes back', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  ctx.programs.line = fakeProgram(['uPV', 'uModel', 'uColor', 'uUseColor']);
  ctx.programs.wide = fakeProgram(['uPV', 'uModel', 'uColor', 'uUseColor', 'uWidth', 'uViewport']);
  const seen = [];
  for (const name of ['drawArrays', 'drawElements']) {            // the state the draw itself was issued in
    const base = gl[name];
    gl[name] = (...args) => { seen.push([gl.depthTest, gl.blendTest]); return base.apply(gl, args); };
  }
  gl.depthTest = true; gl.blendTest = true;                      // a hero that draws opaque geometry first
  const batch = new Float32Array(10 * 4);
  lines(gl, batch);
  assert.deepEqual(seen, [[true, true]], 'the state the call found is the one it draws in');
  assert.equal(gl.depthTest, true, 'and the depth test comes back');
  assert.equal(gl.blendTest, true, 'and the blend');

  seen.length = 0;
  lines(gl, batch, { depth: false });
  assert.deepEqual(seen, [[false, true]], 'a depth: false batch draws with the test off');
  assert.equal(gl.depthTest, true, 'restored after it');

  gl.log.length = 0;
  lines(gl, batch, { width: 3 });                                // three logical pixels: the quads
  assert.ok(ctx.gizmos.lines.wide, 'a width past one device pixel expands the batch');
  assert.equal(gl.log.filter((e) => e[0] === 'drawElements').length, 1, 'one indexed draw a call');
});

test('helmRig: identify hands each lane to the sink, world space under the draw\'s matrix', () => {
  const gl = createGL();
  const ctx = contextOf(gl);
  ctx.programs.line = fakeProgram(['uPV', 'uModel', 'uColor', 'uUseColor']);
  const placed = [];
  ctx.host = { labels: { set: (id, text, x, y, z, opts) => placed.push({ id, text, x, y, z, opts }) } };
  const helm = new PoseHelm();
  const M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 40, 50, 1];    // a translation
  helmRig(gl, helm, { size: 80, M, identify: true });
  assert.equal(placed.length, 6, 'three translation lanes and three rotation ones');
  assert.ok(placed.every((l) => /^helmRig\d+:\d+$/.test(l.id)), 'an id is the rig\'s cache and the label\'s index');
  assert.ok(placed.every((l) => l.opts.frame === true && l.opts.class === 'helm-rig'), 'a frame label, the rig\'s class');
  assert.ok(placed.every((l) => Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.z)));
  // the anchor is the generator's, moved by M: the axes' labels sit on their arms
  const x = placed.find((l) => l.text === 'L' + helm.profile.Tx.lane);
  assert.ok(Math.abs(x.x - 30) > 1, 'the anchor left the origin under M');
  assert.equal(x.z, 50, 'the translation reached every axis');

  // two rigs identify into ids of their own: a cache a helm
  placed.length = 0;
  const other = new PoseHelm();
  helmRig(gl, helm, { size: 80, identify: true });
  helmRig(gl, other, { size: 80, identify: true });
  const ids = new Set(placed.map((l) => l.id.split(':')[0]));
  assert.equal(ids.size, 2, 'each helm keeps its own label namespace');
});
