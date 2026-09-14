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

test('targetSpecs: format per target and per attachment; float: true is half-float', () => {
  assert.equal(targetSpecs(gl).attachments[0].internalFormat, gl.RGBA8);
  const f = targetSpecs(gl, { format: gl.FLOAT });
  assert.equal(f.attachments[0].internalFormat, gl.RGBA32F);
  assert.equal(f.attachments[0].type, gl.FLOAT);
  assert.equal(f.float, true);
  assert.equal(f.float32, true);
  const h = targetSpecs(gl, { format: gl.HALF_FLOAT });
  assert.equal(h.attachments[0].internalFormat, gl.RGBA16F);
  assert.equal(h.float32, false);
  const g = targetSpecs(gl, { color: { position: gl.HALF_FLOAT, normal: gl.HALF_FLOAT, albedo: gl.UNSIGNED_BYTE } });
  assert.deepEqual(g.names, ['position', 'normal', 'albedo']);
  assert.deepEqual(g.attachments.slice(0, 3).map((a) => a.internalFormat), [gl.RGBA16F, gl.RGBA16F, gl.RGBA8]);
  assert.equal(g.float, true);
  const m = targetSpecs(gl, { color: { a: gl.FLOAT, b: 0 }, samples: 4 });
  assert.deepEqual(m.multisample.slice(0, 2).map((a) => a.format), [gl.RGBA32F, gl.RGBA8]);   // an unset entry takes the target's format
});

test('targetSpecs: sampling defaults to linear and clamp; minMag reaches the colour textures, wrap every texture', () => {
  const d = targetSpecs(gl, { depthTexture: true });
  assert.equal(d.attachments[0].minMag, gl.LINEAR);
  assert.equal(d.attachments[0].wrap, gl.CLAMP_TO_EDGE);
  assert.equal(d.attachments[1].minMag, gl.NEAREST);
  const s = targetSpecs(gl, { depthTexture: true, minMag: gl.NEAREST, wrap: gl.REPEAT });
  assert.equal(s.attachments[0].minMag, gl.NEAREST);
  assert.equal(s.attachments[0].wrap, gl.REPEAT);
  assert.equal(s.attachments[1].minMag, gl.NEAREST);      // a depth texture stays nearest
  assert.equal(s.attachments[1].wrap, gl.REPEAT);
});

test('targetSpecs: samples > 1 adds multisampled renderbuffers beside the sampleable textures', () => {
  assert.equal(targetSpecs(gl).samples, 1);
  assert.equal(targetSpecs(gl).multisample, null);
  assert.equal(targetSpecs(gl, { samples: 1 }).multisample, null);

  const m = targetSpecs(gl, { samples: 4 });
  assert.equal(m.samples, 4);
  assert.deepEqual(m.kinds, ['texture']);                  // the depth-stencil renderbuffer moves to the multisampled side
  assert.deepEqual(m.multisample, [
    { attachmentPoint: gl.COLOR_ATTACHMENT0, format: gl.RGBA8, samples: 4 },
    { attachmentPoint: gl.DEPTH_STENCIL_ATTACHMENT, format: gl.DEPTH24_STENCIL8, samples: 4 },
  ]);

  const t = targetSpecs(gl, { samples: 4, depthTexture: true, float: true });
  assert.deepEqual(t.kinds, ['texture', 'texture']);
  assert.deepEqual(t.multisample.map((a) => a.format), [gl.RGBA16F, gl.DEPTH_COMPONENT24]);   // depth format matches the texture for the blit

  const g = targetSpecs(gl, { samples: 2, color: ['a', 'b'] });
  assert.deepEqual(g.multisample.map((a) => a.attachmentPoint), [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1, gl.DEPTH_STENCIL_ATTACHMENT]);

  const s = targetSpecs(gl, { samples: 4, depth: true });
  assert.deepEqual(s.multisample, [{ attachmentPoint: gl.DEPTH_ATTACHMENT, format: gl.DEPTH_COMPONENT24, samples: 4 }]);
});
