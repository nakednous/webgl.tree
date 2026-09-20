/**
 * @file pick tests — readPixel's fence poll against the gl stub: a readback
 *       resolves once its sync signals, the poll runs only while pending,
 *       PBOs are pooled; the id codec round-trips through pick's paint.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idToRgba, rgbaToId } from '@nakednous/tree';
import { init, readPixel, dispose } from '../src/index.js';
import { contextOf } from '../src/context.js';
import { createGL } from './gl.js';

function stubReadback(gl) {
  Object.assign(gl, {
    PIXEL_PACK_BUFFER: 35051, STREAM_READ: 35041, SYNC_GPU_COMMANDS_COMPLETE: 37143,
    TIMEOUT_EXPIRED: 37147, ALREADY_SIGNALED: 37146, CONDITION_SATISFIED: 37148, WAIT_FAILED: 37149,
    syncs: [], pixel: [1, 2, 3, 255],
    getParameter(p) { return p === gl.VIEWPORT ? [0, 0, 640, 480] : null; },
    bindFramebuffer() {}, viewport() {}, readPixels() {}, flush() {},
    fenceSync() { const s = { signaled: false }; gl.syncs.push(s); return s; },
    clientWaitSync(s) { return s.signaled ? gl.CONDITION_SATISFIED : gl.TIMEOUT_EXPIRED; },
    deleteSync(s) { s.deleted = true; },
    getBufferSubData(t, o, out) { out.set(gl.pixel); },
    isContextLost() { return false; },
  });
  return gl;
}

test('readPixel: resolves when the fence signals, polls only while pending, pools the PBO', async () => {
  const gl = stubReadback(createGL());
  const frames = [];
  init(gl, { raf: (cb) => frames.push(cb) });
  const p = readPixel(gl, null, 3, 4);
  assert.equal(frames.length, 1);                 // the poll started
  frames.shift()();                               // a frame passes: not signaled yet
  assert.equal(frames.length, 1);                 // still polling
  gl.syncs[0].signaled = true;
  frames.shift()();
  assert.deepEqual(Array.from(await p), [1, 2, 3, 255]);
  assert.equal(frames.length, 0);                 // nothing pending: the poll stopped
  assert.equal(gl.syncs[0].deleted, true);
  const rb = contextOf(gl).readbacks;
  assert.equal(rb.pool.length, 1);
  const buffers = gl.buffers;
  const q = readPixel(gl, null, 0, 0);
  assert.equal(gl.buffers, buffers);              // the pooled PBO reused
  gl.syncs[1].signaled = true;
  frames.shift()();
  await q;
  assert.equal(rgbaToId(1, 2, 3), 1 | (2 << 8) | (3 << 16));
  const rgba = idToRgba([0, 0, 0, 0], 70000);
  assert.equal(rgbaToId(Math.round(rgba[0] * 255), Math.round(rgba[1] * 255), Math.round(rgba[2] * 255)), 70000);
});

test('readPixel: dispose rejects what is still pending', async () => {
  const gl = stubReadback(createGL());
  init(gl, { raf: () => {} });
  const p = readPixel(gl, null, 0, 0);
  dispose(gl);
  await assert.rejects(p, /disposed/);
});
