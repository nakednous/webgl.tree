/**
 * @file Internal programs — the pass-through vertex stage, the flat texture
 * program and the line pipe's two stages, with the geometry binding they share.
 * @module webgl.tree/programs
 * @license AGPL-3.0-only
 *
 * Nothing here is exported by the package: a hero binds its own shaders. These
 * are the sources the verbs cannot do without — the NDC pass-through vertex
 * stage `program(gl, frag)` attaches, the flat colour / texture program behind
 * `image`, `pane` and the pick pass, and the line pipe's two. The backend
 * compiles and caches them per context; this module is what they are written in
 * and the two calls every draw needs.
 *
 * @details
 * `bindGeometry` binds a geometry to a program and disables what the program
 * declares and the geometry lacks; `samplersOf` names a program's samplers, read
 * once per program. Both take `gl` first, as the bridge's own calls do.
 */

'use strict';

import { setBuffersAndAttributes } from 'twgl.js';

/** The fullscreen pass's vertex stage: aPosition through in NDC, aTexCoord as vTexCoord. */
export const PASS_VERT = `#version 300 es
in vec4 aPosition;
in vec2 aTexCoord;
out vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = aPosition;
}`;

/** The flat program's vertex stage: the covering quad under a matrix, aTexCoord as vTexCoord. */
export const FLAT_VERT = `#version 300 es
in vec4 aPosition;
in vec2 aTexCoord;
uniform mat4 uModelViewProjectionMatrix;
out vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uModelViewProjectionMatrix * aPosition;
}`;

/** The flat fragment stage: a texture times a tint, or the tint alone. */
export const FLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vTexCoord;
uniform vec4 uColor;
uniform sampler2D uTexture;
uniform bool uUseTexture;
out vec4 outColor;
void main() {
  outColor = uUseTexture ? texture(uTexture, vTexCoord) * uColor : uColor;
}`;

/** The line pipe's vertex stage: a per-vertex colour under uPV · uModel. */
export const LINE_VERT = `#version 300 es
in vec3 aPosition;
in vec4 aColor;
uniform mat4 uPV;
uniform mat4 uModel;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uPV * uModel * vec4(aPosition, 1.0);
}`;

/** The line pipe's fragment stage: a per-vertex colour, or uColor. */
export const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
uniform vec4 uColor;
uniform bool uUseColor;
out vec4 outColor;
void main() {
  outColor = uUseColor ? vColor : uColor;
}`;

/** The wide line's vertex stage: each segment as a quad expanded in window space. */
export const WIDE_VERT = `#version 300 es
in vec3 aA;
in vec3 aB;
in float aT;
in float aSide;
in vec4 aColor;
uniform mat4 uPV;
uniform mat4 uModel;
uniform vec2 uViewport;
uniform float uWidth;
out vec4 vColor;
void main() {
  vColor = aColor;
  vec4 cA = uPV * uModel * vec4(aA, 1.0);
  vec4 cB = uPV * uModel * vec4(aB, 1.0);
  vec2 halfVp = uViewport * 0.5;   // 'half' is reserved in GLSL ES 3.00
  vec2 sA = cA.xy / cA.w * halfVp;
  vec2 sB = cB.xy / cB.w * halfVp;
  vec2 d = sB - sA;
  float l = length(d);
  d = l > 0.0 ? d / l : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x) * (uWidth * 0.5 * aSide);
  vec4 c = aT < 0.5 ? cA : cB;
  gl_Position = c + vec4(n / halfVp * c.w, 0.0, 0.0);
}`;

/**
 * Disable every attribute the program declares and the buffers lack. Attribute
 * arrays are context state that outlives a draw: an attribute a mesh does not
 * carry would otherwise keep the array an earlier draw left enabled — another
 * mesh's data, or a read past its end that voids the draw. Disabled, it reads
 * GL's constant value instead, (0, 0, 0, 1) unless gl.vertexAttrib* set
 * another, so a mesh may carry fewer attributes than its program declares,
 * whatever was drawn before it. A vertex array object holds its own attribute
 * state and is left alone. Allocates nothing.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A twgl programInfo.
 * @param {object} obj  A twgl bufferInfo, or a vertexArrayInfo.
 * @ignore
 */
export function disableMissingAttributes(gl, prog, obj) {
  const attribs = obj.attribs, setters = prog.attribSetters;
  if (!attribs || !setters || obj.vertexArrayObject) return;
  for (const name in setters) {
    if (!(name in attribs)) gl.disableVertexAttribArray(setters[name].location);
  }
}

/**
 * Bind a geometry's buffers to a program — the bridge's own, or the one a
 * draw runs under — then disable what the program declares and the geometry
 * lacks (disableMissingAttributes).
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A twgl programInfo.
 * @param {object} buffer  A twgl bufferInfo, or a vertexArrayInfo.
 * @ignore
 */
export function bindGeometry(gl, prog, buffer) {
  setBuffersAndAttributes(gl, prog, buffer);
  disableMissingAttributes(gl, prog, buffer);
}

// The sampler uniforms a program declares, read once per program and kept on it
// under a private key. `filter` binds the pass's input to each of them that the
// bag leaves unset — the same rule by which it already fills uResolution and
// uTexelSize only where a stage declares them.
const SAMPLERS = Symbol('webgl.tree.samplers');
const _SAMPLER_TYPES = ['SAMPLER_2D', 'SAMPLER_3D', 'SAMPLER_CUBE', 'SAMPLER_2D_SHADOW', 'SAMPLER_CUBE_SHADOW',
  'SAMPLER_2D_ARRAY', 'SAMPLER_2D_ARRAY_SHADOW', 'INT_SAMPLER_2D', 'INT_SAMPLER_3D', 'INT_SAMPLER_CUBE',
  'INT_SAMPLER_2D_ARRAY', 'UNSIGNED_INT_SAMPLER_2D', 'UNSIGNED_INT_SAMPLER_3D', 'UNSIGNED_INT_SAMPLER_CUBE',
  'UNSIGNED_INT_SAMPLER_2D_ARRAY'];

/** Whether a GL uniform type is one of the sampler types. @ignore */
function _isSampler(gl, type) {
  for (let i = 0; i < _SAMPLER_TYPES.length; i++) if (gl[_SAMPLER_TYPES[i]] === type) return true;
  return false;
}

/**
 * The names of a program's sampler uniforms, in declaration order, cached on
 * the program. An array of samplers contributes its base name, the key twgl's
 * setters use.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A programInfo.
 * @returns {string[]} @ignore
 */
export function samplersOf(gl, prog) {
  let names = prog[SAMPLERS];
  if (names) return names;
  names = [];
  const n = gl.getProgramParameter(prog.program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog.program, i);
    if (info && _isSampler(gl, info.type)) names.push(info.name.replace(/\[0\]$/, ''));
  }
  Object.defineProperty(prog, SAMPLERS, { value: names, configurable: true });
  return names;
}
