/**
 * @file Visibility — test points, spheres and boxes against a view frustum.
 * @module tree.visibility
 * @license AGPL-3.0-only
 *
 * `tree.cameraPlanes` fills a `Float64Array(24)` with a camera state's six
 * frustum planes; each test reads them and answers `tree.VISIBLE`,
 * `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 */

/**
 * Wholly outside the frustum.
 * @constant {number} INVISIBLE
 * @memberof tree
 */

/**
 * Wholly inside the frustum.
 * @constant {number} VISIBLE
 * @memberof tree
 */

/**
 * Crossing the frustum's boundary.
 * @constant {number} SEMIVISIBLE
 * @memberof tree
 */

/**
 * Whether a point lies inside the frustum.
 * @function pointVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number} `tree.VISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A point sweeps across the white frustum through its axis, 120 from its eye: the readout turns VISIBLE while |x| stays under 66.3, the frustum's half width there.</caption>
 * const { setCamera, axes, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(new Float64Array(24), lens, 4 / 3)
 * const M = new Float32Array(16)
 *
 * function frame(ms) {
 *   const x = 120 * Math.sin(ms / 1000)
 *   tree.mat4FromTranslation(M, x, 0, 0)
 *   const v = tree.pointVisibility(planes, x, 0, 0)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(gl, { M, size: 20 })
 *   out.textContent = 'x ' + x.toFixed(1) + '   ' + (v === tree.VISIBLE ? 'VISIBLE' : 'INVISIBLE')
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * How a sphere meets the frustum.
 * @function sphereVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} cx  Center x.
 * @param {number} cy  Center y.
 * @param {number} cz  Center z.
 * @param {number} radius
 * @returns {number} `tree.VISIBLE`, `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A sphere of radius 30 sweeps across the frustum: white while wholly inside, yellow while it crosses a side plane, magenta once wholly outside — the readout names the state.</caption>
 * const { setCamera, hermite, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(new Float64Array(24), lens, 4 / 3)
 * const names = { [tree.VISIBLE]: 'VISIBLE', [tree.SEMIVISIBLE]: 'SEMIVISIBLE', [tree.INVISIBLE]: 'INVISIBLE' }
 * const colors = { [tree.VISIBLE]: [1, 1, 1, 1], [tree.SEMIVISIBLE]: [1, 0.82, 0.4, 1], [tree.INVISIBLE]: [1, 0.31, 0.85, 1] }
 *
 * // a circle of radius r about c in the plane of unit vectors u and v, as four Hermite quarter arcs
 * function ring(c, r, u, v, color) {
 *   const point = (a) => [0, 1, 2].map((i) => c[i] + r * (Math.cos(a) * u[i] + Math.sin(a) * v[i]))
 *   const tangent = (a) => [0, 1, 2].map((i) => r * Math.PI / 2 * (-Math.sin(a) * u[i] + Math.cos(a) * v[i]))
 *   for (let k = 0; k < 4; k++) {
 *     const a0 = k * Math.PI / 2, a1 = a0 + Math.PI / 2
 *     hermite(gl, point(a0), tangent(a0), point(a1), tangent(a1), { color })
 *   }
 * }
 *
 * function frame(ms) {
 *   const c = [150 * Math.sin(ms / 1500), 0, 0]
 *   const v = tree.sphereVisibility(planes, c[0], c[1], c[2], 30)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   ring(c, 30, [1, 0, 0], [0, 1, 0], colors[v])
 *   ring(c, 30, [1, 0, 0], [0, 0, 1], colors[v])
 *   ring(c, 30, [0, 1, 0], [0, 0, 1], colors[v])
 *   out.textContent = names[v]
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * How an axis-aligned box meets the frustum.
 * @function boxVisibility
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} x0  Minimum corner x.
 * @param {number} y0  Minimum corner y.
 * @param {number} z0  Minimum corner z.
 * @param {number} x1  Maximum corner x.
 * @param {number} y1  Maximum corner y.
 * @param {number} z1  Maximum corner z.
 * @returns {number} `tree.VISIBLE`, `tree.SEMIVISIBLE` or `tree.INVISIBLE`.
 * @example
 * <caption>A 50-unit box sweeps across the frustum: white while wholly inside, yellow while it crosses a side plane, magenta once wholly outside — the readout names the state.</caption>
 * const { setCamera, hermite, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [0, 300, 250] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(new Float64Array(24), lens, 4 / 3)
 * const names = { [tree.VISIBLE]: 'VISIBLE', [tree.SEMIVISIBLE]: 'SEMIVISIBLE', [tree.INVISIBLE]: 'INVISIBLE' }
 * const colors = { [tree.VISIBLE]: [1, 1, 1, 1], [tree.SEMIVISIBLE]: [1, 0.82, 0.4, 1], [tree.INVISIBLE]: [1, 0.31, 0.85, 1] }
 *
 * // the 12 edges of the box [x0, x1] × [y0, y1] × [z0, z1], each a straight Hermite segment
 * function box(x0, y0, z0, x1, y1, z1, color) {
 *   const p = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]
 *   for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
 *     if (i & bit) continue
 *     const a = p(i), b = p(i | bit), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
 *     hermite(gl, a, d, b, d, { color })
 *   }
 * }
 *
 * function frame(ms) {
 *   const x = 150 * Math.sin(ms / 1500)
 *   const v = tree.boxVisibility(planes, x - 25, -25, -25, x + 25, 25, 25)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   box(x - 25, -25, -25, x + 25, 25, 25, colors[v])
 *   out.textContent = names[v]
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */

/**
 * The signed distance from a point to one frustum plane: negative inside, positive outside.
 * @function distanceToPlane
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} planeIdx  0–5; 2 is the near plane, 3 the far plane.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number}
 * @example
 * <caption>A point slides along the white frustum's axis between z = 120 and z = −100: its distance to the near plane turns positive past z = 100, its distance to the far plane past z = −80.</caption>
 * const { setCamera, axes, viewFrustum, tree } = webglTree
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.width = 400
 * canvas.height = 300
 * const gl = canvas.getContext('webgl2')
 * const out = document.body.appendChild(document.createElement('div'))
 * out.style.cssText = 'position:absolute;left:8px;top:8px;color:white;font:13px monospace'
 * const cam = tree.createCamera({ eye: [300, 200, 150], center: [0, 0, 10] })
 * const lens = tree.createCamera({ eye: [0, 0, 120], center: [0, 0, 0], fov: Math.PI / 4, near: 20, far: 200 })
 * const planes = tree.cameraPlanes(new Float64Array(24), lens, 4 / 3)
 * const M = new Float32Array(16)
 *
 * function frame(ms) {
 *   const z = 10 + 110 * Math.sin(ms / 1500)
 *   tree.mat4FromTranslation(M, 0, 0, z)
 *   gl.enable(gl.DEPTH_TEST)
 *   gl.clearColor(0.075, 0.553, 0.459, 1)
 *   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
 *   setCamera(gl, cam)
 *   viewFrustum(gl, { camera: lens, aspect: 4 / 3, color: [1, 1, 1, 1] })
 *   axes(gl, { M, size: 20 })
 *   out.textContent = 'z ' + z.toFixed(0) + '   near ' + tree.distanceToPlane(planes, 2, 0, 0, z).toFixed(1) + '   far ' + tree.distanceToPlane(planes, 3, 0, 0, z).toFixed(1)
 *   requestAnimationFrame(frame)
 * }
 * requestAnimationFrame(frame)
 */
