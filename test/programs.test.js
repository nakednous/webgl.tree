/**
 * The supplied programs' geometry binding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGL } from './gl.js';
import { bindGeometry } from '../src/programs.js';

test('bindGeometry disables every declared attribute the geometry does not supply', () => {
  const gl = createGL();
  const disabled = [];
  gl.disableVertexAttribArray = (location) => disabled.push(location);
  const setter = (location) => Object.assign(() => {}, { location });
  const prog = { attribSetters: { aPosition: setter(0), aColor: setter(1), aTexcoord: setter(2) } };
  bindGeometry(gl, prog, { attribs: { aPosition: {} } });
  assert.deepEqual(disabled.sort(), [1, 2]);
  disabled.length = 0;
  bindGeometry(gl, prog, { attribs: { aPosition: {}, aColor: {}, aTexcoord: {} } });
  assert.deepEqual(disabled, []);
});
