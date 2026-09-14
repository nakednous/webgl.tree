/**
 * @file Matrices — build, combine, decompose and apply 4×4 transforms.
 * @module tree.matrices
 * @license AGPL-3.0-only
 *
 * Column-major 4×4 matrices as flat 16-element arrays — a `Float32Array(16)`
 * or a plain array — the layout WebGL uploads. Every function writes into
 * `out` and returns it, so a matrix allocated once is reused every frame.
 */

/**
 * `out = A · B`: B applies first, then A.
 * @function mat4Mul
 * @memberof tree
 * @param {Float32Array|number[]} out  Destination; may alias A or B.
 * @param {ArrayLike<number>} A
 * @param {ArrayLike<number>} B
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>T · R (colored) spins in place 80 units along x; R · T (yellow) is carried around the origin.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const T = tree.mat4FromTranslation(new Float32Array(16), 80, 0, 0)
 * const R = new Float32Array(16), TR = new Float32Array(16), RT = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(R, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Mul(TR, T, R)
 *   tree.mat4Mul(RT, R, T)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: TR, size: 40 })
 *   axes(gl, { M: RT, size: 40, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The inverse of a matrix.
 * @function mat4Invert
 * @memberof tree
 * @param {Float32Array|number[]} out  Destination; may alias src.
 * @param {ArrayLike<number>} src
 * @returns {Float32Array|number[]|null} out, or null when src is singular.
 * @example
 * <caption>Inverting a camera's view matrix gives its frame: the axes sit at the frustum's apex, blue pointing back, away from what it sees.</caption>
 * const { setCamera, axes, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [-260, 160, 60], center: [30, 20, 40] })
 * const other = tree.createCamera({ eye: [60, 40, 80], fov: Math.PI / 4, near: 20, far: 90 })
 * const V = tree.cameraView(new Float32Array(16), other)
 * const E = tree.mat4Invert(new Float32Array(16), V)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * viewFrustum(gl, { camera: other, color: [1, 1, 1, 1] })
 * axes(gl, { M: E, size: 40 })
 */

/**
 * A model matrix from a translation, a rotation quaternion and a scale.
 * @function mat4FromTRS
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} tx  Translation x.
 * @param {number} ty  Translation y.
 * @param {number} tz  Translation z.
 * @param {number} qx  Rotation quaternion x.
 * @param {number} qy  Rotation quaternion y.
 * @param {number} qz  Rotation quaternion z.
 * @param {number} qw  Rotation quaternion w.
 * @param {number} sx  Scale x.
 * @param {number} sy  Scale y.
 * @param {number} sz  Scale z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Raised 60 above the ground grid, spinning about y, its x axis stretched to twice the others.</caption>
 * const { setCamera, axes, grid, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 60, 0, q[0], q[1], q[2], q[3], 2, 1, 1)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(gl, { M, size: 50 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * A translation matrix.
 * @function mat4FromTranslation
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The small axes moved 80 along x and 40 along y from the white ones at the origin.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromTranslation(new Float32Array(16), 80, 40, 0)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { size: 100, semantic: false, color: [1, 1, 1, 1] })
 * axes(gl, { M, size: 40 })
 */

/**
 * A scale matrix.
 * @function mat4FromScale
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} sx
 * @param {number} sy
 * @param {number} sz
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Scaled by (2, 1, 0.5): against the white unscaled axes, x doubles, y matches and z halves.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromScale(new Float32Array(16), 2, 1, 0.5)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { size: 60, semantic: false, color: [1, 1, 1, 1] })
 * axes(gl, { M, size: 60, depth: false })
 */

/**
 * A rigid frame from three orthonormal axes and an origin.
 * @function mat4FromBasis
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} rx  Right axis x.
 * @param {number} ry  Right axis y.
 * @param {number} rz  Right axis z.
 * @param {number} ux  Up axis x.
 * @param {number} uy  Up axis y.
 * @param {number} uz  Up axis z.
 * @param {number} fx  Forward axis x.
 * @param {number} fy  Forward axis y.
 * @param {number} fz  Forward axis z.
 * @param {number} tx  Origin x.
 * @param {number} ty  Origin y.
 * @param {number} tz  Origin z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A frame from three axes, 80 along x from the white origin axes: its red axis points up, its green axis points to −x.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = tree.mat4FromBasis(new Float32Array(16), 0, 1, 0, -1, 0, 0, 0, 0, 1, 80, 0, 0)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { size: 60, semantic: false, color: [1, 1, 1, 1] })
 * axes(gl, { M, size: 50 })
 */

/**
 * The view matrix (world → eye) of an eye looking at a center.
 * @function mat4View
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} ex  Eye x.
 * @param {number} ey  Eye y.
 * @param {number} ez  Eye z.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} ux  Up x.
 * @param {number} uy  Up y.
 * @param {number} uz  Up z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>A view matrix rebuilt every frame for an eye circling at radius 300, 150 up, always looking at the origin.</caption>
 * const { setCamera, axes, grid, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const P = tree.cameraProj(new Float32Array(16), tree.createCamera(), 400 / 300)
 * const V = new Float32Array(16)
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.mat4View(V, 300 * Math.sin(t), 150, 300 * Math.cos(t), 0, 0, 0, 0, 1, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, V, P)
 *   grid(gl, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(gl, { size: 60 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The eye matrix (eye → world), the inverse of `tree.mat4View` for the same lookat.
 * @function mat4Eye
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} ex  Eye x.
 * @param {number} ey  Eye y.
 * @param {number} ez  Eye z.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} ux  Up x.
 * @param {number} uy  Up y.
 * @param {number} uz  Up z.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The frame of an eye at (100, 60, 80) looking at the origin: its blue axis points away from the origin, back along the yellow line of sight.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [-200, 150, 250] })
 * const E = tree.mat4Eye(new Float32Array(16), 100, 60, 80, 0, 0, 0, 0, 1, 0)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * axes(gl, { size: 40, semantic: false, color: [1, 1, 1, 1] })
 * hermite(gl, [100, 60, 80], [-100, -60, -80], [0, 0, 0], [-100, -60, -80], { color: [1, 0.82, 0.4, 1] })
 * axes(gl, { M: E, size: 40 })
 */

/**
 * A perspective projection from the near plane's extents — symmetric or off-center.
 * @function mat4Persp
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} left  Near-plane left extent.
 * @param {number} right  Near-plane right extent.
 * @param {number} bottom  Near-plane bottom extent.
 * @param {number} top  Near-plane top extent.
 * @param {number} near  Near distance, positive.
 * @param {number} far  Far distance.
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>An off-center frustum, its near plane reaching further right than left: the axes at the origin sit left of the white bulls-eye marking the canvas center.</caption>
 * const { setCamera, axes, beginHUD, endHUD, bullsEye, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const V = tree.mat4View(new Float32Array(16), 0, 0, 300, 0, 0, 0, 0, 1, 0)
 * const P = tree.mat4Persp(new Float32Array(16), -0.3, 0.5, -0.3, 0.3, 1, 1000)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, V, P)
 * axes(gl, { size: 60 })
 * beginHUD(gl)
 * bullsEye(gl, { x: 200, y: 150, size: 30, color: [1, 1, 1, 1] })
 * endHUD(gl)
 */

/**
 * An orthographic projection from the view box's extents.
 * @function mat4Ortho
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 * @param {number} top
 * @param {number} near
 * @param {number} far
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Orthographic: the ground grid's far edge is as long as its near edge — no vanishing point.</caption>
 * const { setCamera, grid, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const V = tree.mat4View(new Float32Array(16), 0, 200, 300, 0, 0, 0, 0, 1, 0)
 * const P = tree.mat4Ortho(new Float32Array(16), -200, 200, -150, 150, 1, 1000)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, V, P)
 * grid(gl, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 */

/**
 * `out = P · V`: world → clip.
 * @function mat4PV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} proj  P.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>P · V takes the tip of the x axis, (100, 0, 0), to NDC: the readout follows it as the eye circles, x and y always within ±1.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const P = tree.cameraProj(new Float32Array(16), tree.createCamera(), 400 / 300)
 * const V = new Float32Array(16), PV = new Float32Array(16)
 * const tip = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.mat4View(V, 300 * Math.sin(t), 150, 300 * Math.cos(t), 0, 0, 0, 0, 1, 0)
 *   tree.mat4PV(PV, P, V)
 *   tree.mat4MulPoint(tip, PV, 100, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, V, P)
 *   axes(gl, { size: 100 })
 *   out.textContent = 'x tip in NDC: ' + tip.map((v) => v.toFixed(2)).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * `out = V · M`: model → eye.
 * @function mat4MV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} model  M.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>V · M carries the spinning model's origin into eye space: the eye circles 250 away, so the readout stays at (0, 0, −250).</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const P = tree.cameraProj(new Float32Array(16), tree.createCamera(), 400 / 300)
 * const V = new Float32Array(16), M = new Float32Array(16), MV = new Float32Array(16)
 * const q = [0, 0, 0, 1], origin = [0, 0, 0]
 * const round = (v) => Math.round(v * 10) / 10 + 0
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.mat4View(V, 250 * Math.sin(t / 2), 0, 250 * Math.cos(t / 2), 0, 0, 0, 0, 1, 0)
 *   tree.qFromAxisAngle(q, 1, 0, 0, t)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MV(MV, M, V)
 *   tree.mat4ToTranslation(origin, MV)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, V, P)
 *   axes(gl, { M, size: 60 })
 *   out.textContent = 'model origin in eye space: ' + origin.map(round).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The normal matrix of a transform: the inverse transpose of its 3×3 block.
 * @function mat3NormalFromMat4
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} src  Usually V · M.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Seen from above, a pane turned 45° and then stretched twice along x: the yellow normal, through the normal matrix, meets it square; the white one, through the model matrix itself, leans.</caption>
 * const { setCamera, pane, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 300, 0], up: [0, 0, -1] })
 * const R = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 0, 1, 0, Math.PI / 4), 1, 1, 1)
 * const M = tree.mat4Mul(new Float32Array(16), tree.mat4FromScale(new Float32Array(16), 2, 1, 1), R)
 * const N = tree.mat3NormalFromMat4(new Float32Array(9), M)
 * const ray = (x, y, z) => { const s = 100 / Math.hypot(x, y, z); return [x * s, y * s, z * s] }
 * const good = ray(N[6], N[7], N[8])    // N · (0, 0, 1)
 * const bad = ray(M[8], M[9], M[10])    // M's 3×3 · (0, 0, 1)
 *
 * gl.enable(gl.DEPTH_TEST)
 * gl.clearColor(0.075, 0.553, 0.459, 1)
 * gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 * setCamera(gl, cam)
 * pane(gl, [-40, 40, 0], [40, 40, 0], [40, -40, 0], [-40, -40, 0], { M, color: [1, 0.31, 0.85, 1] })
 * hermite(gl, [0, 0, 0], good, good, good, { color: [1, 0.82, 0.4, 1], depth: false })
 * hermite(gl, [0, 0, 0], bad, bad, bad, { color: [1, 1, 1, 1], depth: false })
 */

/**
 * Transform a point, divided by w.
 * @function mat4MulPoint
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {ArrayLike<number>} m
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {number[]} out
 * @example
 * <caption>mat4MulPoint carries (80, 0, 0) through the turning frame: the small axes ride on the tip of its x axis.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16), T = new Float32Array(16)
 * const q = [0, 0, 0, 1], p = [0, 0, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulPoint(p, M, 80, 0, 0)
 *   tree.mat4FromTranslation(T, p[0], p[1], p[2])
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 80 })
 *   axes(gl, { M: T, size: 25 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Transform a direction: the 3×3 block only, no translation, no divide.
 * @function mat4MulDir
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {ArrayLike<number>} m
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {number[]} out
 * @example
 * <caption>A direction ignores translation: the yellow line turns with the moved frame's x axis but stays rooted at the origin.</caption>
 * const { setCamera, axes, hermite, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1], d = [0, 0, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 60, 40, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulDir(d, M, 80, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 80 })
 *   hermite(gl, [0, 0, 0], d, d, d, { color: [1, 0.82, 0.4, 1] })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The matrix taking a point's coordinates in one frame to its coordinates in another: `inv(to) · from`.
 * @function mat4Location
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 * @example
 * <caption>A point 50 along the spinning left frame's x, read in the right frame — unrotated, at x = 80: its x there runs between −210 and −110 while the small axes circle.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 200, 300] })
 * const A = new Float32Array(16), L = new Float32Array(16), T = new Float32Array(16)
 * const B = tree.mat4FromTranslation(new Float32Array(16), 80, 0, 0)
 * const q = [0, 0, 0, 1], inB = [0, 0, 0], world = [0, 0, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Location(L, A, B)
 *   tree.mat4MulPoint(inB, L, 50, 0, 0)
 *   tree.mat4MulPoint(world, A, 50, 0, 0)
 *   tree.mat4FromTranslation(T, world[0], world[1], world[2])
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: B, size: 50 })
 *   axes(gl, { M: T, size: 15, semantic: false, color: [1, 0.82, 0.4, 1] })
 *   out.textContent = 'in the right frame: ' + inB.map((v) => v.toFixed(0)).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The 3×3 matrix taking a direction's coordinates in one frame to its coordinates in another.
 * @function mat3Direction
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 * @example
 * <caption>The spinning left frame's x direction, read in the right frame: as it spins, the readout's first and third components trace a unit circle and the second stays 0.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 200, 300] })
 * const A = new Float32Array(16), D = new Float32Array(9)
 * const B = tree.mat4FromTRS(new Float32Array(16), 80, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 0, 1, 0, Math.PI / 2), 1, 1, 1)
 * const q = [0, 0, 0, 1]
 * const round = (v) => Math.round(v * 100) / 100 + 0
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat3Direction(D, A, B)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: B, size: 50 })
 *   out.textContent = 'left x in the right frame: ' + [D[0], D[1], D[2]].map(round).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The translation of a matrix.
 * @function mat4ToTranslation
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 * @example
 * <caption>The translation read back from the moving frame's matrix: its x and z trace a circle of radius 80, y stays 0.</caption>
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
 * const q = [0, 0, 0, 1], t3 = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 1000
 *   tree.qFromAxisAngle(q, 0, 1, 0, t)
 *   tree.mat4FromTRS(M, 80 * Math.cos(t), 0, 80 * Math.sin(t), q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4ToTranslation(t3, M)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 40 })
 *   out.textContent = 'translation: ' + Array.from(t3, (v) => v.toFixed(0)).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The scale of a matrix: the lengths of its three axes.
 * @function mat4ToScale
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 * @example
 * <caption>The scale read back from a turning, pulsing matrix: all three components swing together between 0.5 and 1.5 as the axes grow and shrink.</caption>
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
 * const q = [0, 0, 0, 1], s3 = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 1000, s = 1 + 0.5 * Math.sin(2 * t)
 *   tree.qFromAxisAngle(q, 0, 1, 0, t)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], s, s, s)
 *   tree.mat4ToScale(s3, M)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 60 })
 *   out.textContent = 'scale: ' + Array.from(s3, (v) => v.toFixed(2)).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The rotation of a matrix as a unit quaternion.
 * @function mat4ToRotation
 * @memberof tree
 * @param {number[]} out4  4-element destination, `[x, y, z, w]`.
 * @param {ArrayLike<number>} m
 * @returns {number[]} out4
 * @example
 * <caption>The rotation read out of the left frame's matrix drives the right frame: both tumble in step.</caption>
 * const { setCamera, axes, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const A = new Float32Array(16), B = new Float32Array(16)
 * const q = [0, 0, 0, 1], r = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, Math.SQRT1_2, Math.SQRT1_2, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4ToRotation(r, A)
 *   tree.mat4FromTRS(B, 80, 0, 0, r[0], r[1], r[2], r[3], 1, 1, 1)
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
 * The reflection across the plane `nx·x + ny·y + nz·z = d` — a mirror's view.
 * @function mat4Reflect
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} nx  Unit plane normal x.
 * @param {number} ny  Unit plane normal y.
 * @param {number} nz  Unit plane normal z.
 * @param {number} d  The plane's offset along the normal.
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>Reflected across the white grid, the plane x = 0: the frame spinning on the left spins the opposite way on the right.</caption>
 * const { setCamera, axes, grid, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [0, 150, 320] })
 * const mirror = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 0, 1, 0, Math.PI / 2), 1, 1, 1)
 * const R = tree.mat4Reflect(new Float32Array(16), 1, 0, 0, 0)
 * const A = new Float32Array(16), RA = new Float32Array(16)
 * const q = [0, 0, 0, 1]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(A, -80, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4Mul(RA, R, A)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { M: mirror, size: 70, subdivisions: 7, color: [1, 1, 1, 1] })
 *   axes(gl, { M: A, size: 50 })
 *   axes(gl, { M: RA, size: 50 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The bias matrix: NDC to texture space [0, 1], for sampling a shadow map.
 * @function mat4Bias
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @returns {Float32Array|number[]} out
 * @example
 * <caption>The bias matrix sends NDC's corners (−1, −1, −1) and (1, 1, 1) to texture space's (0, 0, 0) and (1, 1, 1).</caption>
 * const { tree } = webglTree
 *
 * const out = document.body.appendChild(document.createElement('pre'))
 * out.style.cssText = 'margin:8px;color:white;font:13px monospace'
 * const B = tree.mat4Bias(new Float32Array(16))
 * const lo = tree.mat4MulPoint([0, 0, 0], B, -1, -1, -1)
 * const hi = tree.mat4MulPoint([0, 0, 0], B, 1, 1, 1)
 * out.textContent = '(-1, -1, -1) → (' + lo.join(', ') + ')\n(1, 1, 1) → (' + hi.join(', ') + ')'
 */

