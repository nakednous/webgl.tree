/**
 * @file Handles — points dragged on a sphere, a plane, an axis or a dial.
 * @module host.handles
 * @license AGPL-3.0-only
 *
 * `canvasHost.handle(opts)` makes one; each frame, `update()` it before the
 * orbit, read it with `value(out)` or let it drive a bound vec3, and draw it
 * with `handleLocus`.
 */

/**
 * Constraint: the point moves on a sphere about the anchor.
 * @constant {number} SPHERE
 * @memberof tree
 */

/**
 * Constraint: the point moves on a plane through the anchor.
 * @constant {number} PLANE
 * @memberof tree
 */

/**
 * Constraint: the point moves along an axis through the anchor.
 * @constant {number} AXIS
 * @memberof tree
 */

/**
 * Constraint: an angle turned about an axis — a dial.
 * @constant {number} DIAL
 * @memberof tree
 */

/**
 * Constraint: the point moves on the plane through it facing the camera.
 * @constant {number} VIEW
 * @memberof host
 */

/**
 * Take this frame's pointer: grab, drag or release. Call before the orbit's `update()`.
 * @function update
 * @memberof Handle
 * @returns {boolean} Whether the handle is grabbed.
 */

/**
 * Undo the drag in progress: back to the value at grab.
 * @function cancel
 * @memberof Handle
 * @returns {Handle}
 */

/**
 * The handle's current point.
 * @function value
 * @memberof Handle
 * @param {number[]} out  3-element destination.
 * @param {object} [opts]
 * @param {string|ArrayLike<number>} [opts.to]  The space to report in: `tree.WORLD` (default), `tree.EYE`, … or a frame matrix.
 * @returns {number[]} out
 */

/**
 * Bind the target a drag writes into: a vec3 mutated in place — a camera state's eye or center — or `{ get, set }`.
 * @function bind
 * @memberof Handle
 * @param {number[]|object} target
 * @returns {Handle}
 */

/**
 * Re-read the bound target after it changed elsewhere.
 * @function sync
 * @memberof Handle
 */

/**
 * AXIS: the signed distance along the rail; DIAL: the angle turned; NaN otherwise.
 * @function scalar
 * @memberof Handle
 * @returns {number}
 */

/**
 * SPHERE: the azimuth and elevation of the point about the anchor.
 * @function azEl
 * @memberof Handle
 * @param {number[]} out2  2-element destination.
 * @returns {number[]} out2
 */

/**
 * Whether the handle is being dragged.
 * @function grabbed
 * @memberof Handle
 * @returns {boolean}
 */

/**
 * Whether the pointer rests on the handle, or drags it.
 * @function hovered
 * @memberof Handle
 * @returns {boolean}
 */

/**
 * Move the anchor; the point moves with it.
 * @function anchor
 * @memberof Handle
 * @param {number[]} v
 * @returns {Handle}
 */

/**
 * Release the pointer and leave the host.
 * @function dispose
 * @memberof Handle
 */
