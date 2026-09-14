/**
 * @file Projection — read a projection back, and map points between spaces.
 * @module tree.projection
 * @license AGPL-3.0-only
 *
 * Queries read a lens back out of a projection matrix P. Mappings carry a
 * point or a direction between world, eye, NDC and screen space through the
 * view bag `viewOf(gl)` returns, with the viewport passed as `[x, y, w, h]`.
 */

/**
 * NDC depth convention of WebGL: z in [−1, 1].
 * @constant {number} WEBGL
 * @memberof tree
 */

/**
 * NDC depth convention of WebGPU: z in [0, 1].
 * @constant {number} WEBGPU
 * @memberof tree
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
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'near: ' + tree.projNear(P, tree.WEBGL).toFixed(1)
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
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
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'left: ' + tree.projLeft(P, tree.WEBGL).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's right extent, eye space.
 * @function projRight
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'right: ' + tree.projRight(P, tree.WEBGL).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's top extent, eye space.
 * @function projTop
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'top: ' + tree.projTop(P, tree.WEBGL).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The near plane's bottom extent, eye space.
 * @function projBottom
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   out.textContent = 'bottom: ' + tree.projBottom(P, tree.WEBGL).toFixed(1)
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
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
 *   tree.cameraProj(P, lens, 4 / 3, tree.WEBGL)
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

/**
 * World units per pixel at a given eye-space depth.
 * @function pixelRatio
 * @memberof tree
 * @param {ArrayLike<number>} proj  A projection matrix.
 * @param {number} vpH  The viewport height in pixels.
 * @param {number} eyeZ  The eye-space z of the depth measured.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 * @example
 * <caption>The eye dollies between 200 and 600 from the grid: at the grid's depth, one pixel spans from 0.77 to 2.31 world units — the grid cells shrink on screen as the readout grows.</caption>
 * const { setCamera, grid, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 0, 400] })
 *
 * function frame(ms) {
 *   const d = 400 + 200 * Math.sin(ms / 1000)
 *   cam.eye[2] = d
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   out.textContent = 'distance ' + d.toFixed(0) + '   units per pixel ' + tree.pixelRatio(viewOf(gl).mat4Proj, 300, -d, tree.WEBGL).toFixed(2)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Map a point from one space to another.
 * @function mapLocation
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {string} from  `tree.WORLD`, `tree.EYE`, `tree.NDC` or `tree.SCREEN`.
 * @param {string} to  One of the same.
 * @param {object} m  The view bag: `viewOf(gl)`.
 * @param {number[]} vp  The viewport `[x, y, w, h]`; a negative h puts y down.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number[]} out
 * @example
 * <caption>mapLocation takes the tip of the spinning x axis from world space to screen pixels, where the white cross is drawn over it.</caption>
 * const { setCamera, axes, beginHUD, endHUD, cross, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const cam = tree.createCamera({ eye: [180, 150, 300] })
 * const M = new Float32Array(16)
 * const q = [0, 0, 0, 1], tip = [0, 0, 0], screen = [0, 0, 0]
 *
 * function frame(ms) {
 *   tree.qFromAxisAngle(q, 0, 1, 0, ms / 1000)
 *   tree.mat4FromTRS(M, 0, 0, 0, q[0], q[1], q[2], q[3], 1, 1, 1)
 *   tree.mat4MulPoint(tip, M, 100, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   axes(gl, { M, size: 100 })
 *   tree.mapLocation(screen, tip[0], tip[1], tip[2], tree.WORLD, tree.SCREEN, viewOf(gl), [0, 300, 400, -300], tree.WEBGL)
 *   beginHUD(gl)
 *   cross(gl, { x: screen[0], y: screen[1], size: 24, color: [1, 1, 1, 1] })
 *   endHUD(gl)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * Map a direction from one space to another.
 * @function mapDirection
 * @memberof tree
 * @param {number[]} out  3-element destination.
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @param {string} from  `tree.WORLD`, `tree.EYE`, `tree.NDC` or `tree.SCREEN`.
 * @param {string} to  One of the same.
 * @param {object} m  The view bag: `viewOf(gl)`.
 * @param {number[]} vp  The viewport `[x, y, w, h]`; a negative h puts y down.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number[]} out
 * @example
 * <caption>The eye's forward, (0, 0, −1) in eye space, mapped to world space as the eye circles 300 out and 150 up: the readout points at the origin, its y holding at −0.45.</caption>
 * const { setCamera, axes, grid, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const forward = [0, 0, 0]
 *
 * function frame(ms) {
 *   const t = ms / 2000
 *   cam.eye[0] = 300 * Math.sin(t)
 *   cam.eye[2] = 300 * Math.cos(t)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { M: ground, size: 100, subdivisions: 10, color: [1, 1, 1, 1] })
 *   axes(gl, { size: 60 })
 *   tree.mapDirection(forward, 0, 0, -1, tree.EYE, tree.WORLD, viewOf(gl), [0, 300, 400, -300], tree.WEBGL)
 *   out.textContent = 'forward in world: ' + forward.map((v) => v.toFixed(2)).join(', ')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The world ray under a screen point: its origin on the near plane and its unit direction.
 * @function unproject
 * @memberof tree
 * @param {number[]} outO  3-element origin.
 * @param {number[]} outD  3-element unit direction.
 * @param {number} sx  Screen x.
 * @param {number} sy  Screen y.
 * @param {object} m  The view bag: `viewOf(gl)`.
 * @param {number[]} vp  The viewport `[x, y, w, h]`; a negative h puts y down.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number[]|null} outD, or null when the view cannot be inverted.
 * @example
 * <caption>Move the pointer over the canvas: the ray under it, cut where it meets the ground (y = 0), puts the small axes on the grid right under the pointer.</caption>
 * const { setCamera, axes, grid, viewOf, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const ground = tree.mat4FromTRS(new Float32Array(16), 0, 0, 0, ...tree.qFromAxisAngle([0, 0, 0, 1], 1, 0, 0, -Math.PI / 2), 1, 1, 1)
 * const cam = tree.createCamera({ eye: [0, 150, 300] })
 * const origin = [0, 0, 0], dir = [0, 0, 0], M = tree.mat4FromTranslation(new Float32Array(16), 0, 0, 0)
 * let px = 200, py = 150
 * canvas.addEventListener('pointermove', (e) => { px = e.offsetX; py = e.offsetY })
 *
 * function frame() {
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   grid(gl, { M: ground, size: 150, subdivisions: 15, color: [1, 1, 1, 1] })
 *   if (tree.unproject(origin, dir, px, py, viewOf(gl), [0, 300, 400, -300], tree.WEBGL) && dir[1] < 0) {
 *     const s = -origin[1] / dir[1]
 *     tree.mat4FromTranslation(M, origin[0] + s * dir[0], 0, origin[2] + s * dir[2])
 *   }
 *   axes(gl, { M, size: 25 })
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
