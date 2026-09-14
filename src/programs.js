/**
 * @file Internal programs — the pass-through vertex stage and the flat program.
 * @module webgl.tree/programs
 * @license AGPL-3.0-only
 *
 * Nothing here is exported by the package: a hero binds its own shaders.
 * These are the programs the verbs cannot do without, compiled lazily per
 * context and reachable only through them — the NDC pass-through vertex
 * stage program(frag) attaches, and the flat colour / texture program behind
 * image, pane and the pick pass.
 */

'use strict';

import { createProgramInfo } from 'twgl.js';
import { contextOf } from './context.js';

/** The fullscreen pass's vertex stage: aPosition through in NDC, aTexCoord as vTexCoord. */
export const PASS_VERT = `#version 300 es
in vec4 aPosition;
in vec2 aTexCoord;
out vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = aPosition;
}`;

const FLAT_VERT = `#version 300 es
in vec4 aPosition;
in vec2 aTexCoord;
uniform mat4 uModelViewProjectionMatrix;
out vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uModelViewProjectionMatrix * aPosition;
}`;

const FLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vTexCoord;
uniform vec4 uColor;
uniform sampler2D uTexture;
uniform bool uUseTexture;
out vec4 outColor;
void main() {
  outColor = uUseTexture ? texture(uTexture, vTexCoord) * uColor : uColor;
}`;

const LINE_VERT = `#version 300 es
in vec3 aPosition;
in vec4 aColor;
uniform mat4 uPV;
uniform mat4 uModel;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uPV * uModel * vec4(aPosition, 1.0);
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
uniform vec4 uColor;
uniform bool uUseColor;
out vec4 outColor;
void main() {
  outColor = uUseColor ? vColor : uColor;
}`;

/**
 * The flat colour / texture program of a context: uColor, uTexture,
 * uUseTexture, uModelViewProjectionMatrix.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} A twgl programInfo.
 */
export function flatProgram(gl) {
  const ctx = contextOf(gl);
  if (!ctx.programs.flat) ctx.programs.flat = createProgramInfo(gl, [FLAT_VERT, FLAT_FRAG]);
  return ctx.programs.flat;
}

const WIDE_VERT = `#version 300 es
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
 * The wide line program of a context (experimental): each segment as a
 * quad expanded in screen space by uWidth pixels — aA, aB the endpoints,
 * aT which one, aSide the side, optional aColor; uPV, uModel, uViewport,
 * uColor.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} A twgl programInfo.
 */
export function wideLineProgram(gl) {
  const ctx = contextOf(gl);
  if (!ctx.programs.wide) ctx.programs.wide = createProgramInfo(gl, [WIDE_VERT, LINE_FRAG]);
  return ctx.programs.wide;
}

/**
 * The line pipe's program of a context: aPosition, optional aColor (read
 * when uUseColor), uPV, uModel, uColor.
 * @param {WebGL2RenderingContext} gl
 * @returns {object} A twgl programInfo.
 */
export function lineProgram(gl) {
  const ctx = contextOf(gl);
  if (!ctx.programs.line) ctx.programs.line = createProgramInfo(gl, [LINE_VERT, LINE_FRAG]);
  return ctx.programs.line;
}
