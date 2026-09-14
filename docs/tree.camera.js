/**
 * @file Camera state — a lookat and a lens as plain data.
 * @module tree.camera
 * @license AGPL-3.0-only
 *
 * A camera state is `{ eye, center, up, fov, halfHeight, near, far }`:
 * `setCamera(gl, cam)` installs it, the functions here move it and derive
 * its matrices. A state with `fov` is perspective; one with `halfHeight` and
 * no `fov` is orthographic.
 */

/**
 * A camera state; the one call that allocates.
 * @function createCamera
 * @memberof tree
 * @param {object} [opts]
 * @param {number[]} [opts.eye=[0, 0, 500]]
 * @param {number[]} [opts.center=[0, 0, 0]]
 * @param {number[]} [opts.up=[0, 1, 0]]
 * @param {number|null} [opts.fov=π/3]  Vertical field of view, radians.
 * @param {number|null} [opts.halfHeight=null]  Half the view's height, world units; without fov, orthographic.
 * @param {number} [opts.near=0.1]
 * @param {number} [opts.far=1000]
 * @returns {object} The camera state.
 */

/**
 * Copy one camera state into another.
 * @function cameraCopy
 * @memberof tree
 * @param {object} out
 * @param {object} cam
 * @returns {object} out
 */

/**
 * The view matrix (world → eye) of a camera state.
 * @function cameraView
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @returns {Float32Array|number[]} out
 */

/**
 * The eye matrix (eye → world) of a camera state.
 * @function cameraEye
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @returns {Float32Array|number[]} out
 */

/**
 * The projection matrix of a camera state's lens.
 * @function cameraProj
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {object} cam
 * @param {number} aspect  Width over height.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]|null} out, or null when the lens is degenerate.
 */

/**
 * Orbit the eye about the center: an azimuth about the up hint and an elevation, clamped short of the poles.
 * @function cameraOrbit
 * @memberof tree
 * @param {object} cam
 * @param {number} dAz  Azimuth step, radians.
 * @param {number} dEl  Elevation step, radians.
 * @param {object} [opts]
 * @param {number} [opts.maxEl]  The elevation limit, radians.
 * @returns {object} cam
 */

/**
 * Pan: move eye and center together along the view's right and up.
 * @function cameraPan
 * @memberof tree
 * @param {object} cam
 * @param {number} dx  World units along right.
 * @param {number} dy  World units along up.
 * @returns {object} cam
 */

/**
 * Dolly: scale the eye's distance to the center — or, orthographic, the half height.
 * @function cameraDolly
 * @memberof tree
 * @param {object} cam
 * @param {number} factor  Below 1 moves in.
 * @param {object} [opts]
 * @param {number} [opts.min]  The closest distance.
 * @param {number} [opts.max]  The farthest distance.
 * @returns {object} cam
 */

/**
 * Point a camera state from a pose: the eye at its position, looking down its −z.
 * @function cameraFromPose
 * @memberof tree
 * @param {object} cam
 * @param {{ pos: number[], rot: number[] }} pose
 * @returns {object} cam
 */

/**
 * A camera state's lookat as a pose.
 * @function cameraToPose
 * @memberof tree
 * @param {{ pos: number[], rot: number[] }} pose  Destination.
 * @param {object} cam
 * @returns {{ pos: number[], rot: number[] }} pose
 */

/**
 * Read a camera state back from an eye matrix and a projection.
 * @function cameraFromMat4
 * @memberof tree
 * @param {object} cam  Destination.
 * @param {ArrayLike<number>} E  The eye matrix (eye → world).
 * @param {ArrayLike<number>} P  The projection.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {object} cam
 */

/**
 * The six frustum planes of a camera state, for the visibility tests.
 * @function cameraPlanes
 * @memberof tree
 * @param {Float64Array} planes  A `Float64Array(24)`.
 * @param {object} cam
 * @param {number} aspect  Width over height.
 * @returns {Float64Array|null} planes, or null when the lens is degenerate.
 */

/**
 * The eight world corners of a camera state's frustum: near face 0–3, far face 4–7, each from bottom-left counter-clockwise.
 * @function frustumCorners
 * @memberof tree
 * @param {Float64Array|number[]} out24  24-element destination.
 * @param {object} cam
 * @param {number} [aspect]  Width over height.
 * @param {number} [ndcZMin]  `tree.WEBGL` for WebGL.
 * @returns {Float64Array|number[]|null} out24, or null when the lens is degenerate.
 */
