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
 */

/**
 * The signed distance from a point to one frustum plane: negative inside, positive outside.
 * @function distanceToPlane
 * @memberof tree
 * @param {Float64Array} planes  From `tree.cameraPlanes`.
 * @param {number} planeIdx  0–5.
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number}
 */
