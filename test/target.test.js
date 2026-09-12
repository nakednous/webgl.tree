/**
 * @file target tests — the five shapes resolved into attachment specs
 *       against the gl constants stub; the GPU side is the browser harness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetSpecs, SCREEN } from '../src/index.js';
import { createGL } from './gl.js';

const gl = createGL();

test('targetSpecs: the default is one RGBA8 texture and a depth-stencil renderbuffer', () => {
  const s = targetSpecs(gl);
  assert.equal(SCREEN, null);
  assert.deepEqual(s.kinds, ['texture', 'renderbuffer']);
  assert.equal(s.attachments[0].internalFormat, gl.RGBA8);
  assert.equal(s.attachments[0].attachmentPoint, gl.COLOR_ATTACHMENT0);
  assert.equal(s.attachments[1].format, gl.DEPTH_STENCIL);
  assert.equal(s.color, true);
  assert.equal(s.depthTexture, false);
});

test('targetSpecs: depth only, color + depth texture, color only, float', () => {
  const d = targetSpecs(gl, { depth: true });
  assert.deepEqual(d.kinds, ['texture']);
  assert.equal(d.attachments[0].attachmentPoint, gl.DEPTH_ATTACHMENT);
  assert.equal(d.attachments[0].internalFormat, gl.DEPTH_COMPONENT24);
  assert.equal(d.color, false);
  assert.equal(d.depthTexture, true);

  const t = targetSpecs(gl, { depthTexture: true });
  assert.deepEqual(t.kinds, ['texture', 'texture']);
  assert.equal(t.attachments[1].attachmentPoint, gl.DEPTH_ATTACHMENT);
  assert.equal(t.depthTexture, true);

  const c = targetSpecs(gl, { depth: false });
  assert.deepEqual(c.kinds, ['texture']);
  assert.equal(c.depthTexture, false);

  const f = targetSpecs(gl, { float: true });
  assert.equal(f.attachments[0].internalFormat, gl.RGBA16F);
  assert.equal(f.attachments[0].type, gl.HALF_FLOAT);
  assert.equal(f.float, true);
});

test('targetSpecs: named colour attachments in list order, then the depth', () => {
  const g = targetSpecs(gl, { color: ['albedo', 'normal', 'position'], float: true });
  assert.deepEqual(g.names, ['albedo', 'normal', 'position']);
  assert.deepEqual(g.kinds, ['texture', 'texture', 'texture', 'renderbuffer']);
  assert.deepEqual(g.attachments.slice(0, 3).map((a) => a.attachmentPoint), [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1, gl.COLOR_ATTACHMENT0 + 2]);
  const gd = targetSpecs(gl, { color: ['a', 'b'], depthTexture: true });
  assert.deepEqual(gd.kinds, ['texture', 'texture', 'texture']);
  assert.equal(gd.attachments[2].attachmentPoint, gl.DEPTH_ATTACHMENT);
});
