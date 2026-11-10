/**
 * @file query tests — the verdict slot against the gl stub: the conservative
 *       default, the answer landing a frame later, the ring refusing a question
 *       when it is full, the conservative target, and dispose releasing objects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { query, dispose } from '../src/index.js';
import { createGL } from './gl.js';

test('query: reads true until a verdict lands, then the verdict; the ring bounds the questions', () => {
  const gl = createGL();
  const slot = query(gl, { pool: 2 });
  let drawn = 0;
  const draw = () => { drawn++; };

  assert.equal(slot.value, true, 'the conservative default');
  assert.ok(slot.ask(draw));
  assert.equal(drawn, 1, 'the question wraps the draw');
  assert.equal(slot.pending, 1);
  assert.equal(slot.value, true, 'a question in flight changes nothing yet');

  gl.landQueries(false);                       // the GPU answers: the bound is hidden
  assert.ok(slot.ask(draw));                   // collecting happens before the next question
  assert.equal(slot.value, false, 'the landed verdict is read');
  assert.equal(slot.latency, 1, 'it took one ask to land');
  assert.equal(slot.pending, 1, 'the earlier object was spent and reused');

  const full = query(gl, { pool: 1 });
  assert.ok(full.ask(draw));
  assert.equal(full.ask(draw), false, 'a full ring skips the frame');
  assert.equal(full.pending, 1);
});

test('query: conservative asks the conservative target; dispose releases every object', () => {
  const gl = createGL();
  const slot = query(gl);
  slot.ask(() => {}, { conservative: true });
  const began = gl.log.filter((e) => e[0] === 'beginQuery');
  assert.deepEqual(began.at(-1).slice(1, 2), [gl.ANY_SAMPLES_PASSED_CONSERVATIVE]);
  slot.ask(() => {});
  assert.deepEqual(gl.log.filter((e) => e[0] === 'beginQuery').at(-1).slice(1, 2), [gl.ANY_SAMPLES_PASSED]);

  const made = gl.madeQueries.length;
  assert.ok(made >= 1);
  slot.dispose();
  assert.equal(slot.ask(() => {}), false, 'a disposed slot asks nothing');
  assert.equal(gl.log.filter((e) => e[0] === 'deleteQuery').length, made, 'every object deleted');
  dispose(gl);
});
