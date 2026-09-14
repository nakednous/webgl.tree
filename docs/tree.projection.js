/**
 * @file Projection — read a lens back out of a projection matrix.
 * @module tree.projection
 * @license AGPL-3.0-only
 *
 * Queries read near, far, the near plane's extents and the fields of view
 * out of a projection matrix P — the one `viewOf(gl).mat4Proj` holds, or one
 * built with `tree.cameraProj`. The space names below are what `mapLocation`,
 * `mapDirection` and `unproject` take.
 */

/**
 * World space.
 * @constant {string} WORLD
 * @memberof tree
 */

/**
 * Eye space: the camera at the origin looking down −z.
 * @constant {string} EYE
 * @memberof tree
 */

/**
 * Normalized device coordinates.
 * @constant {string} NDC
 * @memberof tree
 */

/**
 * Screen space: pixels of the viewport.
 * @constant {string} SCREEN
 * @memberof tree
 */

/**
 * Whether a projection is orthographic.
 * @function projIsOrtho
 * @memberof tree
 * @param {ArrayLike<number>} p  A projection matrix.
 * @returns {boolean}
 * @example
 * <caption>Every two seconds the lens switches between perspective and orthographic; the readout, taken from the installed projection, follows.</caption>
 * const { setCamera, grid, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const persp = tree.createCamera({ eye: [0, 200, 300] })
 * const ortho = tree.createCamera({ eye: [0, 200, 300], halfHeight: 150 })
 *
 * function frame(ms) {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, Math.floor(ms / 2000) % 2 ? ortho : persp)
 *   grid(gl, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   out.textContent = 'orthographic: ' + tree.projIsOrtho(viewOf(gl).mat4Proj)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near-plane distance of a projection.
 * @function projNear
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum's near plane slides between 20 and 100; the readout, taken from its projection matrix, follows.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], fov: Math.PI / 3, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.near = 60 + 40 * Math.sin(ms / 1000)
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'near: ' + tree.projNear(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The far-plane distance of a projection.
 * @function projFar
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum's far plane slides between 120 and 220; the readout, taken from its projection matrix, follows.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], fov: Math.PI / 3, near: 40 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.far = 170 + 50 * Math.sin(ms / 1000)
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'far: ' + tree.projFar(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's left extent, eye space.
 * @function projLeft
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: its near plane, 50 out, reaches left between −17.9 and −46.7.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'left: ' + tree.projLeft(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's right extent, eye space.
 * @function projRight
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: its near plane, 50 out, reaches right between 17.9 and 46.7.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'right: ' + tree.projRight(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's top extent, eye space.
 * @function projTop
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: its near plane, 50 out, reaches up between 13.4 and 35.0.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'top: ' + tree.projTop(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's bottom extent, eye space.
 * @function projBottom
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows: its near plane, 50 out, reaches down between −13.4 and −35.0.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'bottom: ' + tree.projBottom(P).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The vertical field of view of a perspective projection, in radians.
 * @function projFov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum widens and narrows; the readout, taken from its projection matrix, swings between 30° and 70°.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'fov: ' + (tree.projFov(P) * 180 / Math.PI).toFixed(1) + '°'
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The horizontal field of view of a perspective projection, in radians.
 * @function projHfov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 * @example
 * <caption>The white frustum, 4:3, widens and narrows: its vertical field of view swings between 30° and 70°, the horizontal one, in the readout, between 39.3° and 86.1°.</caption>
 * const { setCamera, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 250], center: [0, 0, -60] })
 * const lens = tree.createCamera({ eye: [0, 0, 100], center: [0, 0, 0], near: 50, far: 200 })
 * const P = new Float32Array(16)
 *
 * function frame(ms) {
 *   lens.fov = (50 + 20 * Math.sin(ms / 1000)) * Math.PI / 180
 *   tree.cameraProj(P, lens, 4 / 3)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'hfov: ' + (tree.projHfov(P) * 180 / Math.PI).toFixed(1) + '°'
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

