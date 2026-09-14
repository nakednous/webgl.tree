/**
 * @file Quaternions — rotations as `[x, y, z, w]`.
 * @module tree.quaternions
 * @license AGPL-3.0-only
 *
 * A rotation is a unit quaternion in a plain 4-element array, `[x, y, z, w]`,
 * the identity being `[0, 0, 0, 1]`. Every function writes into `out` and
 * returns it.
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
 */

/**
 * Copy a quaternion.
 * @function qCopy
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 */

/**
 * The dot product of two quaternions.
 * @function qDot
 * @memberof tree
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */

/**
 * `out = a · b`: b rotates first, then a.
 * @function qMul
 * @memberof tree
 * @param {number[]} out  Destination; may alias a or b.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 */

/**
 * The conjugate — the inverse rotation of a unit quaternion.
 * @function qConjugate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 */

/**
 * Normalize a quaternion in place.
 * @function qNormalize
 * @memberof tree
 * @param {number[]} out
 * @returns {number[]} out
 */

/**
 * The negated quaternion: the same rotation from the other hemisphere.
 * @function qNegate
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @returns {number[]} out
 */

/**
 * Rotate a vector.
 * @function qRotateVec3
 * @memberof tree
 * @param {number[]} out  3-element destination; may alias v.
 * @param {number[]} q  A unit quaternion.
 * @param {number[]} v  The vector.
 * @returns {number[]} out
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
 */

/**
 * The rotation that points −z along a direction, with y toward an up hint.
 * @function qFromLookDir
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} dir  The look direction.
 * @param {number[]} [up=[0, 1, 0]]  The up hint.
 * @returns {number[]} out
 */

/**
 * The shortest rotation taking one unit vector onto another.
 * @function qFromUnitVectors
 * @memberof tree
 * @param {number[]} out
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]} out
 */

/**
 * The rotation of a matrix's 3×3 block.
 * @function qFromMat4
 * @memberof tree
 * @param {number[]} out
 * @param {ArrayLike<number>} m
 * @returns {number[]} out
 */

/**
 * A rotation matrix from a quaternion.
 * @function qToMat4
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number[]} q
 * @returns {Float32Array|number[]} out
 */

/**
 * A unit quaternion as an axis and an angle.
 * @function qToAxisAngle
 * @memberof tree
 * @param {number[]} q
 * @param {object} [out]  Destination `{ axis, angle }`.
 * @returns {{ axis: number[], angle: number }} out
 */
