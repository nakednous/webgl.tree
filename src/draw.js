/**
 * @file The draw — bind a program, draw geometry under the declared transforms.
 * @module twgl.tree/draw
 * @license AGPL-3.0-only
 *
 * `bind` a program, then `draw` twgl geometry: each of these transform
 * uniforms the program declares is uploaded from the model matrix and the
 * camera `setCamera` installed.
 *
 * ```
 * uModelMatrix                 M
 * uViewMatrix                  V
 * uModelViewMatrix             V · M
 * uProjectionMatrix            P
 * uModelViewProjectionMatrix   P · V · M
 * uNormalMatrix                (V · M)⁻ᵀ, 3×3
 * ```
 *
 * @details
 * draw is setBuffersAndAttributes on the bound program, then the declared
 * transforms, then drawBufferInfo. The transforms are computed into context
 * scratch and each is uploaded only if the bound program declares it, read
 * off programInfo.uniformSetters once per program. A fullscreen pass declares none and gets none; a shadow capture that
 * declares uModelMatrix and its own light matrix gets uModelMatrix and
 * nothing the bridge would mistake for the light's. Zero allocation per draw.
 */

'use strict';

import { mat4Mul, mat3NormalFromMat4 } from '@nakednous/tree';
import { setUniforms, setBuffersAndAttributes, drawBufferInfo } from 'twgl.js';
import { contextOf } from './context.js';

/** The transform names a program may declare, in the order the bridge fills them. */
export const TRANSFORMS = ['uModelMatrix', 'uViewMatrix', 'uModelViewMatrix', 'uProjectionMatrix', 'uModelViewProjectionMatrix', 'uNormalMatrix'];

/**
 * Which of the six transforms a program declares.
 * @details Read off its uniform setters; the bridge sets no name outside
 * `TRANSFORMS`.
 * @param {object} setters  programInfo.uniformSetters.
 * @returns {{ model:boolean, view:boolean, mv:boolean, proj:boolean, mvp:boolean, normal:boolean, any:boolean }}
 */
export function declaredTransforms(setters) {
  const s = setters || {};
  const d = {
    model: typeof s.uModelMatrix === 'function',
    view: typeof s.uViewMatrix === 'function',
    mv: typeof s.uModelViewMatrix === 'function',
    proj: typeof s.uProjectionMatrix === 'function',
    mvp: typeof s.uModelViewProjectionMatrix === 'function',
    normal: typeof s.uNormalMatrix === 'function',
  };
  d.any = d.model || d.view || d.mv || d.proj || d.mvp || d.normal;
  return d;
}

const _declared = (ctx, prog) => {
  let d = ctx.declared.get(prog);
  if (!d) { d = declaredTransforms(prog.uniformSetters); ctx.declared.set(prog, d); }
  return d;
};

const _isMat4 = (m) => m != null && typeof m === 'object' && typeof m.length === 'number' && m.length >= 16;
const IDENTITY = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

/**
 * Upload the transforms the bound program declares, for a model matrix M
 * (null for identity), from the context's installed V and P.
 * @param {object} ctx
 * @param {object} prog
 * @param {ArrayLike<number>|null} M
 */
export function uploadTransforms(ctx, prog, M) {
  const d = _declared(ctx, prog);
  if (!d.any) return;
  const s = prog.uniformSetters;
  const MV = M ? mat4Mul(ctx.MV, ctx.V, M) : ctx.V;
  if (d.model) s.uModelMatrix(M || IDENTITY);
  if (d.view) s.uViewMatrix(ctx.V);
  if (d.mv) s.uModelViewMatrix(MV);
  if (d.proj) s.uProjectionMatrix(ctx.P);
  if (d.mvp) s.uModelViewProjectionMatrix(M ? mat4Mul(ctx.MVP, ctx.P, MV) : ctx.PV);
  if (d.normal) s.uNormalMatrix(mat3NormalFromMat4(ctx.N, MV));
}

/**
 * Bind a program and set its uniforms.
 * @param {WebGL2RenderingContext} gl
 * @param {object} prog  A twgl programInfo.
 * @param {object} [uniforms]  Values by name, as twgl.setUniforms takes them.
 * @returns {object} prog
 * @example
 * <caption>One program bound twice: a magenta cube on the left, a yellow one on the right.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, bind, draw } from 'twgl.tree'
 * import { createCamera, mat4FromTRS } from '@nakednous/tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * in vec3 aNormal;
 * uniform mat4 uModelViewProjectionMatrix;
 * uniform mat3 uNormalMatrix;
 * out vec3 vNormal;
 * void main() {
 *   vNormal = uNormalMatrix * aNormal;
 *   gl_Position = uModelViewProjectionMatrix * aPosition;
 * }`, `#version 300 es
 * precision highp float;
 * in vec3 vNormal;
 * uniform vec3 uColor;
 * out vec4 outColor;
 * void main() {
 *   float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 1.0))), 0.0);
 *   outColor = vec4(uColor * (0.3 + 0.7 * d), 1.0);
 * }`])
 * const cube = twgl.primitives.createCubeVertices(80)
 * const box = twgl.createBufferInfoFromArrays(gl, { aPosition: cube.position, aNormal: cube.normal, indices: cube.indices })
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, createCamera({ eye: [150, 200, 400] }))
 * bind(gl, prog, { uColor: [1, 0.31, 0.85] })
 * draw(gl, box, mat4FromTRS(new Float32Array(16), -80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 * bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 * draw(gl, box, mat4FromTRS(new Float32Array(16), 80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 */
export function bind(gl, prog, uniforms) {
  const ctx = contextOf(gl);
  if (!prog || !prog.program) { console.error('[twgl.tree] bind: `prog` must be a twgl programInfo.'); return null; }
  gl.useProgram(prog.program);
  ctx.prog = prog;
  if (uniforms) setUniforms(prog, uniforms);
  return prog;
}

function _draw(gl, obj, M, opts, instances) {
  const ctx = contextOf(gl);
  const prog = ctx.prog;
  if (!prog) { console.error('[twgl.tree] draw: no program bound — call bind(gl, prog) first.'); return; }
  if (!obj) { console.error('[twgl.tree] draw: `obj` must be a twgl bufferInfo.'); return; }
  setBuffersAndAttributes(gl, prog, obj);
  uploadTransforms(ctx, prog, M);
  const o = opts || {};
  drawBufferInfo(gl, obj, o.mode, o.count, o.offset, instances);
}

/**
 * Draw geometry under the bound program, uploading the transforms it
 * declares.
 * @param {WebGL2RenderingContext} gl
 * @param {object} obj  A twgl bufferInfo.
 * @param {ArrayLike<number>} [M]  A model mat4; omitted for identity.
 * @param {{ mode?:number, count?:number, offset?:number }} [opts]  Forwarded to drawBufferInfo.
 * @example
 * <caption>A magenta cube turning about the vertical axis through its model matrix.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, bind, draw } from 'twgl.tree'
 * import { createCamera, mat4FromTRS, qFromAxisAngle } from '@nakednous/tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * in vec3 aNormal;
 * uniform mat4 uModelViewProjectionMatrix;
 * uniform mat3 uNormalMatrix;
 * out vec3 vNormal;
 * void main() {
 *   vNormal = uNormalMatrix * aNormal;
 *   gl_Position = uModelViewProjectionMatrix * aPosition;
 * }`, `#version 300 es
 * precision highp float;
 * in vec3 vNormal;
 * uniform vec3 uColor;
 * out vec4 outColor;
 * void main() {
 *   float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 1.0))), 0.0);
 *   outColor = vec4(uColor * (0.3 + 0.7 * d), 1.0);
 * }`])
 * const cube = twgl.primitives.createCubeVertices(120)
 * const box = twgl.createBufferInfoFromArrays(gl, { aPosition: cube.position, aNormal: cube.normal, indices: cube.indices })
 * const cam = createCamera({ eye: [150, 200, 400] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   bind(gl, prog, { uColor: [1, 0.31, 0.85] })
 *   draw(gl, box, mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1))
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function draw(gl, obj, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }   // draw(gl, obj, opts)
  _draw(gl, obj, M || null, opts, undefined);
}

/**
 * Draw n instances of geometry; the vertex stage reads gl_InstanceID.
 * @param {WebGL2RenderingContext} gl
 * @param {object} obj  A twgl bufferInfo.
 * @param {number} n  Instance count.
 * @param {ArrayLike<number>} [M]  A model mat4; omitted for identity.
 * @param {{ mode?:number, count?:number, offset?:number }} [opts]
 * @example
 * <caption>Five yellow cubes in a row from one call; the vertex shader spaces them by gl_InstanceID.</caption>
 * import * as twgl from 'twgl.js'
 * import { setCamera, bind, drawInstanced } from 'twgl.tree'
 * import { createCamera } from '@nakednous/tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * in vec3 aNormal;
 * uniform mat4 uModelViewProjectionMatrix;
 * uniform mat3 uNormalMatrix;
 * out vec3 vNormal;
 * void main() {
 *   vNormal = uNormalMatrix * aNormal;
 *   vec4 offset = vec4(float(gl_InstanceID - 2) * 70.0, 0.0, 0.0, 0.0);
 *   gl_Position = uModelViewProjectionMatrix * (aPosition + offset);
 * }`, `#version 300 es
 * precision highp float;
 * in vec3 vNormal;
 * uniform vec3 uColor;
 * out vec4 outColor;
 * void main() {
 *   float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 1.0))), 0.0);
 *   outColor = vec4(uColor * (0.3 + 0.7 * d), 1.0);
 * }`])
 * const cube = twgl.primitives.createCubeVertices(50)
 * const box = twgl.createBufferInfoFromArrays(gl, { aPosition: cube.position, aNormal: cube.normal, indices: cube.indices })
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, createCamera({ eye: [150, 200, 400] }))
 * bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 * drawInstanced(gl, box, 5)
 */
export function drawInstanced(gl, obj, n, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }
  _draw(gl, obj, M || null, opts, n);
}
