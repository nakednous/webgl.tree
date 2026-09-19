/**
 * @file The draw — bind a program, draw geometry under the declared transforms.
 * @module webgl.tree/draw
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
 * draw binds the buffers' attributes on the bound program — disabling what the
 * program declares and the buffers lack — then the declared
 * transforms, then drawBufferInfo. The transforms are computed into context
 * scratch and each is uploaded only if the bound program declares it, read
 * off programInfo.uniformSetters once per program. A fullscreen pass declares none and gets none; a shadow capture that
 * declares uModelMatrix and its own light matrix gets uModelMatrix and
 * nothing the bridge would mistake for the light's. Zero allocation per draw.
 */

'use strict';

import { mat4Mul, mat3NormalFromMat4 } from '@nakednous/tree';
import { setUniforms, drawBufferInfo, createBufferInfoFromArrays } from 'twgl.js';
import { contextOf } from './context.js';
import { bindGeometry } from './programs.js';

/** The transform names a program may declare, in the order the bridge fills them. */
export const TRANSFORMS = ['uModelMatrix', 'uViewMatrix', 'uModelViewMatrix', 'uProjectionMatrix', 'uModelViewProjectionMatrix', 'uNormalMatrix'];

/**
 * Which of the six transforms a program declares.
 * @details Read off its uniform setters; the bridge sets no name outside
 * `TRANSFORMS`.
 * @param {object} setters  programInfo.uniformSetters.
 * @returns {{ model:boolean, view:boolean, mv:boolean, proj:boolean, mvp:boolean, normal:boolean, any:boolean }}
 * @ignore
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
 * @ignore
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
 * const { createCanvas, setCamera, bind, draw, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
 * setCamera(gl, tree.createCamera({ eye: [76, 102, 204] }))
 * bind(gl, prog, { uColor: [1, 0.31, 0.85] })
 * draw(gl, box, tree.mat4FromTRS(tree.mat4(), -80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 * bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 * draw(gl, box, tree.mat4FromTRS(tree.mat4(), 80, 0, 0, 0, 0, 0, 1, 1, 1, 1))
 */
export function bind(gl, prog, uniforms) {
  const ctx = contextOf(gl);
  if (!prog || !prog.program) { console.error('[webgl.tree] bind: `prog` must be a twgl programInfo.'); return null; }
  gl.useProgram(prog.program);
  ctx.prog = prog;
  if (uniforms) setUniforms(prog, uniforms);
  return prog;
}

function _draw(gl, obj, M, opts, instances) {
  const ctx = contextOf(gl);
  const prog = ctx.prog;
  if (!prog) { console.error('[webgl.tree] draw: no program bound — call bind(gl, prog) first.'); return; }
  if (!obj) { console.error('[webgl.tree] draw: `obj` must be a twgl bufferInfo.'); return; }
  bindGeometry(gl, prog, obj);
  uploadTransforms(ctx, prog, M);
  const o = opts || {};
  drawBufferInfo(gl, obj, o.mode, o.count, o.offset, instances);
}

// The arrays shape's keys as the attribute names the bridge's shaders use.
const ATTRIBUTES = {
  position: 'aPosition', normal: 'aNormal', tangent: 'aTangent', texcoord: 'aTexCoord', color: 'aColor',
  joints: 'aJoints', weights: 'aWeights',
};

// Numbers to upload: a typed array, a list of numbers, or either under `data`.
const _isNumbers = (a) => ArrayBuffer.isView(a) || (Array.isArray(a) && typeof a[0] === 'number');
const _isAttribute = (a) => a != null && (_isNumbers(a) || _isNumbers(a.data));

/**
 * A twgl bufferInfo from the arrays shape — what host.loadMesh's mesh, a loadModel part's, tree.platonic's and
 * twgl's primitives both carry — under the bridge's attribute names: position
 * → aPosition, normal → aNormal, tangent → aTangent, texcoord → aTexCoord,
 * color → aColor, joints → aJoints, weights → aWeights. `indices` and any
 * other key holding numbers pass through as they are, so arrays already named
 * for a shader mix in; a key that holds no numbers — a mesh's `bounds`, a
 * generator's `count` and `labels` — is skipped, so a mesh from host.loadMesh,
 * tree.platonic or a gizmo generator goes in whole. Joint indices upload
 * unnormalised.
 * @param {WebGL2RenderingContext} gl
 * @param {object} arrays  The arrays shape: `{ position, indices?, normal?, … }`, each a
 *        `{ numComponents, data }` or a typed array twgl can size.
 * @returns {object} A twgl bufferInfo, what draw takes.
 * @example
 * <caption>A model file: host.loadMesh reads models/torus.obj into a mesh, and the yellow torus tumbles about X, lit by the file's normals.</caption>
 * const { createCanvas, setCamera, bind, buffer, draw, host, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
 *
 * // a mesh is { position, normal, texcoord, indices } with its bounds; buffer names the attributes aPosition, aNormal, aTexCoord
 * let torus = null
 * host.loadMesh('models/torus.obj').then((mesh) => {
 *   torus = buffer(gl, mesh)
 *   requestAnimationFrame(frame)
 * })
 * const cam = tree.createCamera({ eye: [0, 160, 192] })
 * const M = tree.mat4()
 * const q = tree.quat()
 *
 * function frame(ms) {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   tree.qFromAxisAngle(q, 1, 0, 0, ms / 1000)
 *   bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 *   draw(gl, torus, tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1))
 *   requestAnimationFrame(frame)
 * }
 * @example
 * <caption>A Platonic solid from tree: the dodecahedron's faces coloured by their orientation through the axis palette, tumbling.</caption>
 * const { createCanvas, setCamera, bind, buffer, draw, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 *
 * const prog = twgl.createProgramInfo(gl, [`#version 300 es
 * in vec4 aPosition;
 * in vec3 aNormal;
 * in vec4 aColor;
 * uniform mat4 uModelViewProjectionMatrix;
 * uniform mat3 uNormalMatrix;
 * out vec3 vNormal;
 * out vec4 vColor;
 * void main() {
 *   vNormal = uNormalMatrix * aNormal;
 *   vColor = aColor;
 *   gl_Position = uModelViewProjectionMatrix * aPosition;
 * }`, `#version 300 es
 * precision highp float;
 * in vec3 vNormal;
 * in vec4 vColor;
 * out vec4 outColor;
 * void main() {
 *   float d = max(dot(normalize(vNormal), normalize(vec3(0.4, 0.6, 1.0))), 0.0);
 *   outColor = vec4(vColor.rgb * (0.35 + 0.65 * d), 1.0);
 * }`])
 * // { position, normal, texcoord, color, indices } → aPosition, aNormal, aTexCoord, aColor
 * const solid = buffer(gl, tree.platonic(tree.DODECAHEDRON, { radius: 110 }))
 * const cam = tree.createCamera({ eye: [0, 120, 330] })
 * const M = tree.mat4()
 * const q = tree.quat()
 *
 * function frame(ms) {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.09, 0.1, 0.13, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   tree.qFromAxisAngle(q, 0.4, 1, 0.2, ms / 1400)
 *   bind(gl, prog)
 *   draw(gl, solid, tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1))
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
export function buffer(gl, arrays) {
  const named = {};
  for (const key in arrays) {
    let a = arrays[key];
    if (!_isAttribute(a)) continue;                        // a mesh's bounds, a generator's count and labels
    if (key === 'joints') a = a.data ? { ...a, normalize: false } : { numComponents: 4, data: a, normalize: false };
    named[ATTRIBUTES[key] || key] = a;
  }
  return createBufferInfoFromArrays(gl, named);
}

/**
 * Draw geometry under the bound program, uploading the transforms it
 * declares. An attribute the program declares and `obj` lacks reads GL's
 * constant value, (0, 0, 0, 1) unless gl.vertexAttrib* set another — never an
 * earlier draw's array — so meshes carrying different attributes share a
 * program.
 * @param {WebGL2RenderingContext} gl
 * @param {object} obj  A twgl bufferInfo.
 * @param {ArrayLike<number>} [M]  A model mat4; omitted for identity.
 * @param {{ mode?:number, count?:number, offset?:number }} [opts]  Forwarded to drawBufferInfo.
 * @example
 * <caption>A magenta cube turning about the vertical axis through its model matrix.</caption>
 * const { createCanvas, setCamera, bind, draw, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
 * const canvas = gl.canvas
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
 * const cam = tree.createCamera({ eye: [76, 102, 204] })
 * const M = tree.mat4()
 * const q = tree.quat()
 *
 * function frame(ms) {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   bind(gl, prog, { uColor: [1, 0.31, 0.85] })
 *   draw(gl, box, tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1))
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
 * const { createCanvas, setCamera, bind, drawInstanced, tree } = webglTree
 *
 * const gl = createCanvas(400, 300)
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
 * setCamera(gl, tree.createCamera({ eye: [99, 131, 263] }))
 * bind(gl, prog, { uColor: [1, 0.82, 0.4] })
 * drawInstanced(gl, box, 5)
 */
export function drawInstanced(gl, obj, n, M, opts) {
  if (M != null && !_isMat4(M)) { opts = M; M = null; }
  _draw(gl, obj, M || null, opts, n);
}
