/**
 * @file Projection — read a projection back, and map points between spaces.
 * @module tree.projection
 * @license AGPL-3.0-only
 *
 * Queries read a lens back out of a projection matrix P. Mappings carry a
 * point or a direction between world, eye, NDC and screen space through the
 * view bag `viewOf(gl)` returns.
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
 */

/**
 * The near-plane distance of a projection.
 * @function projNear
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 */

/**
 * The far-plane distance of a projection.
 * @function projFar
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 */

/**
 * The near plane's left extent, eye space.
 * @function projLeft
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 */

/**
 * The near plane's right extent, eye space.
 * @function projRight
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 */

/**
 * The near plane's top extent, eye space.
 * @function projTop
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 */

/**
 * The near plane's bottom extent, eye space.
 * @function projBottom
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {number}
 */

/**
 * The vertical field of view of a perspective projection, in radians.
 * @function projFov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
 */

/**
 * The horizontal field of view of a perspective projection, in radians.
 * @function projHfov
 * @memberof tree
 * @param {ArrayLike<number>} p
 * @returns {number}
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
 */
