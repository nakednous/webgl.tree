/**
 * @file state tests — the pair, the swap, the count and the clears, against the
 *       fake GL; the frames themselves are the browser harness's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pipe, state } from '../src/index.js';
import { createGL } from './gl.js';

// A pass program whose one sampler records what it is handed.
function accumProgram(gl) {
  const got = {};
  const uniformSetters = { uScene: (v) => { got.uScene = v; }, uWeight: () => {} };
  const prog = { program: {}, uniformSetters, attributeSetters: {}, got };
  gl.activeUniforms.set(prog.program, [{ name: 'uScene', type: gl.SAMPLER_2D }]);
  return prog;
}

const sideBoundAtDraw = (gl) => {
  const log = gl.log;
  const names = log.map((e) => e[0]);
  const at = Math.max(names.lastIndexOf('drawArrays'), names.lastIndexOf('drawElements'));
  for (let i = at; i >= 0; i--) if (log[i][0] === 'bindFramebuffer') return log[i][2];
  return 'none';
};

test('state: a pair, a count, and sides that are the verb\'s to move', () => {
  const gl = createGL();
  const s = state(gl, { width: 64, height: 32, format: gl.FLOAT, minMag: gl.NEAREST });
  assert.equal(s.count, 0);
  assert.notEqual(s.read, s.write);
  assert.equal(s.read.width, 64);
  assert.equal(s.read.height, 32);
  // the sides and the count are the verb's: an assignment is a loud failure,
  // never the silent drift between a pair and a counter
  assert.throws(() => { s.read = s.write; }, TypeError);
  assert.throws(() => { s.count = 7; }, TypeError);
  assert.notEqual(s.read, s.write);
  assert.equal(s.count, 0);
});

test('state.pass: the read side is the input, the write side the target, then the swap', () => {
  const gl = createGL();
  const prog = accumProgram(gl);
  const s = state(gl, { width: 64, height: 32, format: gl.FLOAT, minMag: gl.NEAREST });
  const firstRead = s.read, firstWrite = s.write;

  s.pass(prog, { uWeight: 1 });
  assert.equal(prog.got.uScene, firstRead.color, 'the input is the read side at the call');
  assert.equal(sideBoundAtDraw(gl), firstWrite.framebuffer.id, 'the draw lands in the write side');
  assert.equal(s.count, 1);
  assert.equal(s.read, firstWrite, 'the side just written is the read side now');
  assert.equal(s.write, firstRead);

  s.pass(prog, { uWeight: 0.5 });
  assert.equal(prog.got.uScene, firstWrite.color);
  assert.equal(s.count, 2);
  assert.equal(s.read, firstRead, 'the pair alternates');
});

test('state.pass: the framebuffer and the viewport it found are restored', () => {
  const gl = createGL();
  const prog = accumProgram(gl);
  const s = state(gl, { width: 64, height: 32, format: gl.FLOAT, minMag: gl.NEAREST });
  const outer = { id: 99 };
  gl.boundFramebuffer = outer;
  gl.viewport4 = [1, 2, 3, 4];
  s.pass(prog);
  assert.equal(gl.boundFramebuffer, outer);
  assert.deepEqual(gl.viewport4, [1, 2, 3, 4]);
});

test('state.swap: exchanges the sides and leaves the count alone', () => {
  const gl = createGL();
  const s = state(gl, { width: 8, height: 8 });
  const a = s.read, b = s.write;
  s.swap();
  assert.equal(s.read, b);
  assert.equal(s.write, a);
  assert.equal(s.count, 0);
});

test('state.reset: clears both sides to its own colour, zeroes the count, restores the context', () => {
  const gl = createGL();
  const s = state(gl, { width: 8, height: 8, clear: [0, 0, 0, 0] });
  const outer = { id: 7 };
  gl.boundFramebuffer = outer;
  gl.clearColorValue = [0.1, 0.2, 0.3, 1];
  s.pass(accumProgram(gl));
  gl.clears.length = 0;
  s.reset();
  assert.equal(gl.clears.length, 2, 'both sides are cleared');
  assert.deepEqual(gl.clearColorValue, [0.1, 0.2, 0.3, 1], 'the context keeps its own clear colour');
  assert.equal(gl.boundFramebuffer, outer);
  assert.equal(s.count, 0);
});

test('state.resize and dispose: the count zeroes, the attachments go', () => {
  const gl = createGL();
  const s = state(gl, { width: 8, height: 8 });
  s.pass(accumProgram(gl));
  s.resize(16, 12);
  assert.equal(s.count, 0);
  assert.equal(s.read.width, 16);
  assert.equal(s.write.height, 12);
  gl.log.length = 0;
  s.dispose();
  assert.equal(gl.log.filter((e) => e[0] === 'deleteFramebuffer').length, 2);
});

test('state.pass: a program that did not bind advances nothing', () => {
  const gl = createGL();
  const s = state(gl, { width: 8, height: 8 });
  const a = s.read, b = s.write;
  const outer = { id: 5 };
  gl.boundFramebuffer = outer;
  gl.depthTest = true;
  s.pass(null);                                   // program(gl, frag) returns null on a compile error
  assert.equal(s.count, 0, 'the count is a pass\'s, and no pass ran');
  assert.equal(s.read, a);
  assert.equal(s.write, b);
  assert.equal(gl.boundFramebuffer, outer, 'the caller\'s target is back');
  assert.equal(gl.depthTest, true, 'and the depth test it found');
});

test('state: the pair is defined as it is made', () => {
  const gl = createGL();
  const outer = { id: 7 };
  gl.boundFramebuffer = outer;
  gl.clears.length = 0;
  const s = state(gl, { width: 8, height: 8 });
  assert.equal(s.count, 0, 'a fresh state has run no pass');
  assert.equal(gl.clears.length, 2, 'both sides are cleared as they are made');
  assert.equal(gl.boundFramebuffer, outer, 'and the caller keeps its target');
});

test('state.resize: the pair is defined again, and the count with it', () => {
  const gl = createGL();
  const s = state(gl, { width: 8, height: 8 });
  s.pass(accumProgram(gl));
  assert.equal(s.count, 1);
  const after = s.read;                       // the side the pass wrote
  gl.clears.length = 0;
  s.resize(16, 16);
  assert.equal(s.count, 0);
  assert.equal(s.read, after, 'a resize does not swap: the sides are a pass\'s');
  assert.equal(gl.clears.length, 2, 'reallocated storage is defined too');
});

test('a state composes: pipe reads the state\'s read side, and leaves the pair alone', () => {
  const gl = createGL();
  const s = state(gl, { width: 16, height: 8 });
  s.pass(accumProgram(gl));
  const read = s.read, count = s.count;
  const flat = accumProgram(gl);                       // a chain stage, one sampler
  gl.log.length = 0;
  const out = pipe(gl, s.read.color, [{ program: flat, uniforms: {} }], { display: false, key: 'chain' });
  assert.ok(out, 'the chain produced a target');
  assert.equal(s.read, read, 'the chain does not swap another verb\'s pair');
  assert.equal(s.count, count);
  assert.equal(out.color !== undefined, true);
});
