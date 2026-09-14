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
 */

/**
 * The inverse of a matrix.
 * @function mat4Invert
 * @memberof tree
 * @param {Float32Array|number[]} out  Destination; may alias src.
 * @param {ArrayLike<number>} src
 * @returns {Float32Array|number[]|null} out, or null when src is singular.
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
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
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
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @param {number} [ndcYSign=1]  −1 flips y.
 * @returns {Float32Array|number[]} out
 */

/**
 * `out = P · V`: world → clip.
 * @function mat4PV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} proj  P.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 */

/**
 * `out = V · M`: model → eye.
 * @function mat4MV
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} model  M.
 * @param {ArrayLike<number>} view  V.
 * @returns {Float32Array|number[]} out
 */

/**
 * The normal matrix of a transform: the inverse transpose of its 3×3 block.
 * @function mat3NormalFromMat4
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} src  Usually V · M.
 * @returns {Float32Array|number[]} out
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
 */

/**
 * The matrix taking a point's coordinates in one frame to its coordinates in another: `inv(to) · from`.
 * @function mat4Location
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 */

/**
 * The 3×3 matrix taking a direction's coordinates in one frame to its coordinates in another.
 * @function mat3Direction
 * @memberof tree
 * @param {Float32Array|number[]} out  9-element destination.
 * @param {ArrayLike<number>} from  The source frame's matrix (frame → world).
 * @param {ArrayLike<number>} to  The destination frame's matrix (frame → world).
 * @returns {Float32Array|number[]|null} out, or null when `to` is singular.
 */

/**
 * The translation of a matrix.
 * @function mat4ToTranslation
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 */

/**
 * The scale of a matrix: the lengths of its three axes.
 * @function mat4ToScale
 * @memberof tree
 * @param {Float32Array|number[]} out3  3-element destination.
 * @param {ArrayLike<number>} m
 * @returns {Float32Array|number[]} out3
 */

/**
 * The rotation of a matrix as a unit quaternion.
 * @function mat4ToRotation
 * @memberof tree
 * @param {number[]} out4  4-element destination, `[x, y, z, w]`.
 * @param {ArrayLike<number>} m
 * @returns {number[]} out4
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
 */

/**
 * The bias matrix: NDC to texture space [0, 1], for sampling a shadow map.
 * @function mat4Bias
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {Float32Array|number[]} out
 */

/**
 * The viewport matrix W: NDC to screen pixels, depth to [0, 1].
 * @function mat4Viewport
 * @memberof tree
 * @param {Float32Array|number[]} out
 * @param {number[]} vp  The viewport `[x, y, w, h]`; a negative h puts y down.
 * @param {number} ndcZMin  `tree.WEBGL` for WebGL.
 * @returns {Float32Array|number[]} out
 */
