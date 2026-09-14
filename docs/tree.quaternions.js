/**
 * @file Quaternions — rotations as `[x, y, z, w]`.
 * @module tree.quaternions
 * @license AGPL-3.0-only
 *
 * A rotation is a unit quaternion in a plain 4-element array, `[x, y, z, w]`,
 * the identity being `[0, 0, 0, 1]`. Every function writes into `out` and
 * returns it; `tree.mat4FromTRS` turns one into a model matrix.
 */

/**
 * Set a quaternion's four components.
 * @function qSet
 * @memberof tree
 * @param {number[]} out
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} w
 * @returns {number[]} out
 * @example
 * <caption>qSet writes (0, sin θ/2, 0, cos θ/2) every frame: the axes spin about y.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   const half = ms / 2000
 *   tree.qSet(q, 0, Math.sin(half), 0, Math.cos(half))
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 80 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Copy a quaternion.
 * @function qCopy
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>The left frame spins; the right one copies its rotation once a second, so it jumps to catch up.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = new Float32Array(16), B = new Float32Array(16)
 * const q = [0, 0, 0, 1], copy = [0, 0, 0, 1]
 * let last = -1
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   if (Math.floor(ms / 1000) !== last) { last = Math.floor(ms / 1000); tree.qCopy(copy, q) }
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, copy[0], copy[1], copy[2], copy[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: B, size: 50 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The dot product of two quaternions.
 * @function qDot
 * @memberof tree
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 * @example
 * <caption>A spin's dot with the identity is cos(θ / 2): 1 at rest, 0 after half a turn, −1 after a full turn — the same orientation, from the other hemisphere.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1], identity = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   const turns = (ms / 8000) % 2
 *   tree.qFromAxisAngle(q, 0, 1, 0, turns * 2 * Math.PI)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 80 })
 *   out.textContent = 'turns ' + turns.toFixed(2) + '   dot ' + tree.qDot(q, identity).toFixed(2)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * `out = a · b`: b rotates first, then a.
 * @function qMul
 * @memberof tree
 * @param {number[]} out  Destination; may alias a or b.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 * @example
 * <caption>a · b, with a a fixed 45° tilt about x and b a spin about y: the frame's green axis stays on the yellow tilted line while the frame spins around it.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [250, 100, 250] })
 * const M = new Float32Array(16)
 * const tilt = tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, Math.PI / 4)
 * const spin = [0, 0, 0, 1], q = [0, 0, 0, 1]
 * const axis = tree.qRotateVec3([0, 0, 0], tilt, [0, 120, 0])
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(spin, 0, 1, 0, ms / 1000)
 *   tree.qMul(q, tilt, spin)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   hermite(gl, [0, 0, 0], axis, axis, axis, { color: [1, 0.82, 0.4, 1] })
 *   axes(gl, { M, size: 80 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The conjugate — the inverse rotation of a unit quaternion.
 * @function qConjugate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>The left frame turns by q, the right by its conjugate: the same speed, the opposite way.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = new Float32Array(16), B = new Float32Array(16)
 * const q = [0, 0, 0, 1], c = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.qConjugate(c, q)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, c[0], c[1], c[2], c[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: B, size: 50 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Normalize a quaternion in place.
 * @function qNormalize
 * @memberof tree
 * @param {number[]} out
 * @returns {number[]} out
 * @example
 * <caption>(0, 2, 0, 2) normalized is (0, 0.71, 0, 0.71), a quarter turn about y: against the white axes, the frame's red x now points along −z.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const q = tree.qNormalize([0, 2, 0, 2])
 * const M = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { size: 100, semantic: false, color: [1, 1, 1, 1] })
 * axes(gl, { M, size: 80 })
 * out.textContent = 'normalized: ' + q.map((v) => v.toFixed(2)).join(', ')
 */

/**
 * The negated quaternion: the same rotation from the other hemisphere.
 * @function qNegate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 * @example
 * <caption>−q is the same rotation as q: the left frame turns by q, the right by its negation, in step.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = new Float32Array(16), B = new Float32Array(16)
 * const q = [0, 0, 0, 1], n = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.qNegate(n, q)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTRS(B, 80, 0, 0, n[0], n[1], n[2], n[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: B, size: 50 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Rotate a vector.
 * @function qRotateVec3
 * @memberof tree
 * @param {number[]} out  3-element destination; may alias v.
 * @param {number[]} q  A unit quaternion.
 * @param {number[]} v  The vector.
 * @returns {number[]} out
 * @example
 * <caption>(100, 0, 0) rotated by a quaternion turning about the white (1, 1, 0) axis: the yellow line sweeps a cone around it.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [-150, 150, 300] })
 * const q = [0, 0, 0, 1], v = [0, 0, 0]
 * const axis = [100, 100, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.qRotateVec3(v, q, [100, 0, 0])
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { size: 60 })
 *   hermite(gl, [0, 0, 0], axis, axis, axis, { color: [1, 1, 1, 1] })
 *   hermite(gl, [0, 0, 0], v, v, v, { color: [1, 0.82, 0.4, 1] })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Spherical interpolation: constant angular speed from a to b.
 * @function qSlerp
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t  0 at a, 1 at b.
 * @returns {number[]} out
 * @example
 * <caption>The middle frame slerps from the left frame's orientation to the right one's and back, turning at a steady speed.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 360] })
 * const a = [0, 0, 0, 1]
 * const b = tree.qFromAxisAngle([0, 0, 0, 1], 0, 0, 1, Math.PI * 0.9)
 * const A = tree.mat4FromTRS(new Float32Array(16), -120, 0, 0, a[0], a[1], a[2], a[3], 1, 1, 1)
 * const B = tree.mat4FromTRS(new Float32Array(16), 120, 0, 0, b[0], b[1], b[2], b[3], 1, 1, 1)
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   const t = 0.5 - 0.5 * Math.cos(ms / 1000)
 *   tree.qSlerp(q, a, b, t)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 45 })
 *   axes(gl, { M: B, size: 45 })
 *   axes(gl, { M, size: 45 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Normalized linear interpolation: cheaper than `tree.qSlerp`, the same path, uneven speed.
 * @function qNlerp
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t  0 at a, 1 at b.
 * @returns {number[]} out
 * @example
 * <caption>Between the same two orientations, 170° apart: the yellow nlerp frame and the white slerp frame meet at both ends and halfway, and part in between.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 200, 250] })
 * const a = [0, 0, 0, 1]
 * const b = tree.qFromAxisAngle([0, 0, 0, 1], 0, 1, 0, 170 * Math.PI / 180)
 * const S = new Float32Array(16), N = new Float32Array(16)
 * const s = [0, 0, 0, 1], n = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   const t = (ms / 4000) % 1
 *   tree.qSlerp(s, a, b, t)
 *   tree.qNlerp(n, a, b, t)
 *   tree.mat4FromTRS(S, 0, 0, 0, s[0], s[1], s[2], s[3], 1, 1, 1)
 *   tree.mat4FromTRS(N, 0, 0, 0, n[0], n[1], n[2], n[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: S, size: 100, semantic: false, color: [1, 1, 1, 1] })
 *   axes(gl, { M: N, size: 100, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   out.textContent = 't ' + t.toFixed(2)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A rotation of an angle about an axis.
 * @function qFromAxisAngle
 * @memberof tree
 * @param {number[]} out
 * @param {number} ax  Unit axis x.
 * @param {number} ay  Unit axis y.
 * @param {number} az  Unit axis z.
 * @param {number} angle  Radians, right-handed.
 * @returns {number[]} out
 * @example
 * <caption>A quarter turn per second about the white (1, 1, 1) axis, which the frame keeps pointing along.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [-150, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 * const k = 1 / Math.sqrt(3), axis = [100 * k, 100 * k, 100 * k]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, k, k, k, (ms / 1000) * Math.PI / 2)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   hermite(gl, [0, 0, 0], axis, axis, axis, { color: [1, 1, 1, 1] })
 *   axes(gl, { M, size: 70 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation that points −z along a direction, with y toward an up hint.
 * @function qFromLookDir
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} dir  The look direction.
 * @param {number[]} [up=[0, 1, 0]]  The up hint.
 * @returns {number[]} out
 * @example
 * <caption>Built from the direction to the circling yellow point: the frame's −z aims at it, so its blue axis points directly away.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 200, 300] })
 * const M = new Float32Array(16), T = new Float32Array(16)
 * const q = [0, 0, 0, 1], target = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   target[0] = 110 * Math.cos(t); target[1] = 40; target[2] = 110 * Math.sin(t)
 *   tree.qFromLookDir(q, target)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4FromTranslation(T, target[0], target[1], target[2])
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   hermite(gl, [0, 0, 0], target, target, target, { color: [1, 0.82, 0.4, 1] })
 *   axes(gl, { M: T, size: 12, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   axes(gl, { M, size: 60 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The shortest rotation taking one unit vector onto another.
 * @function qFromUnitVectors
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 * @example
 * <caption>The shortest rotation from +y onto the circling yellow direction: the frame's green axis follows the yellow line.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1], d = [0, 0, 0], line = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   d[0] = 0.8 * Math.cos(t); d[1] = 0.6; d[2] = 0.8 * Math.sin(t)
 *   tree.qFromUnitVectors(q, [0, 1, 0], d)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   line[0] = 120 * d[0]; line[1] = 120 * d[1]; line[2] = 120 * d[2]
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   hermite(gl, [0, 0, 0], line, line, line, { color: [1, 0.82, 0.4, 1] })
 *   axes(gl, { M, size: 70 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation of a matrix's 3×3 block.
 * @function qFromMat4
 * @memberof tree
 * @param {number[]} out
 * @param {ArrayLike<number>} m
 * @returns {number[]} out
 * @example
 * <caption>The rotation of an eye matrix at (100, 60, 80), re-applied at the origin: the small frame there matches the eye's frame, blue pointing away from the origin.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [-200, 150, 250] })
 * const E = tree.mat4Eye(new Float32Array(16), 100, 60, 80, 0, 0, 0, 0, 1, 0)
 * const q = tree.qFromMat4([0, 0, 0, 1], E)
 * const M = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { M: E, size: 40 })
 * axes(gl, { M, size: 40 })
 */

/**
 * A rotation matrix from a quaternion.
 * @function qToMat4
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number[]} q
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>qToMat4 writes a whole rotation matrix: the axes tumble about the origin.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, 0, Math.SQRT1_2, ms / 1000)
 *   tree.qToMat4(M, q)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 80 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A unit quaternion as an axis and an angle.
 * @function qToAxisAngle
 * @memberof tree
 * @param {number[]} q
 * @param {object} [out]  Destination `{ axis, angle }`.
 * @returns {{ axis: number[], angle: number }} out
 * @example
 * <caption>Read back from a quaternion turning about z: the axis stays (0, 0, 1) while the angle climbs from 0 to 2π and wraps.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 0, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1], aa = { axis: [0, 0, 0], angle: 0 }
 *
 * function frame(ms) {
 *   const angle = (ms / 1000) % (2 * Math.PI)
 *   tree.qFromAxisAngle(q, 0, 0, 1, angle)
 *   tree.qToAxisAngle(q, aa)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 100 })
 *   out.textContent = 'axis ' + aa.axis.map((v) => Math.round(v * 100) / 100 + 0).join(', ') + '   angle ' + aa.angle.toFixed(2)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
