/**
 * @file The canvas host — pointer, clock, handles, tracks, helms, orbit, labels, media.
 * @module host
 * @license AGPL-3.0-only
 *
 * `host.createHost(canvas)` gives a canvas what is neither math nor drawing:
 * its pointer, a frame clock and size, and the constructs that tick with it.
 * Attach it with `init(gl, { host })`, then each frame: `setCamera`, update
 * handles, let the orbit take the pointer nobody grabbed, draw, and — when the
 * application owns the loop — `tick(dt)` and `pointer.flush()`.
 */

/**
 * The host of a canvas. With `onFrame` it runs its own animation loop; without it, call `tick(dt)` and `pointer.flush()` every frame.
 * @function createHost
 * @memberof host
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {function(number, object):void} [opts.onFrame]  Called every frame with dt (seconds) and the host.
 * @param {number} [opts.ndcZMin=tree.WEBGL]
 * @param {function(number, number, number):void} [opts.onSize]  Called with width, height and device pixel ratio when the canvas resizes.
 * @returns {object} The host.
 */

/**
 * The frame named by a helm's own orientation.
 * @constant {string} SELF
 * @memberof tree
 */

/**
 * Seconds since the host was created.
 * @function clock
 * @memberof Host
 * @returns {number}
 */

/**
 * Advance everything the host ticks — playing tracks, helms, devices — by dt; for a loop the application owns.
 * @function tick
 * @memberof Host
 * @param {number} dt  Seconds.
 */

/**
 * A draggable handle on the canvas.
 * @function handle
 * @memberof Host
 * @param {object} opts
 * @param {number|object} opts.constraint  `tree.SPHERE`, `tree.PLANE`, `tree.AXIS`, `tree.DIAL` or `host.VIEW`.
 * @param {number[]} [opts.anchor]  The sphere's, plane's, axis's or dial's reference point.
 * @param {number} [opts.radius]  SPHERE: the radius.
 * @param {number[]} [opts.normal]  PLANE, DIAL: the normal.
 * @param {number[]} [opts.axis]  AXIS: the rail's direction.
 * @param {number} [opts.snap]  A snap step: radians for SPHERE and DIAL, world units otherwise.
 * @param {number} [opts.grabPx=12]  The grab radius in pixels.
 * @param {number[]|object} [opts.bind]  The target dragged: a vec3 mutated in place, or `{ get, set }`.
 * @param {function} [opts.onGrab]
 * @param {function} [opts.onChange]
 * @param {function} [opts.onRelease]
 * @returns {Handle|null} The handle, or null for an invalid constraint.
 */

/**
 * A keyframe track of poses that plays by itself while the host ticks.
 * @function poseTrack
 * @memberof Host
 * @param {object} [opts]
 * @param {boolean|object} [opts.handles]  Draggable keyframe handles.
 * @returns {PoseTrack}
 */

/**
 * A keyframe track of camera states that writes into `cam` while it plays.
 * @function cameraTrack
 * @memberof Host
 * @param {object} cam  The camera state driven.
 * @param {object} [opts]
 * @param {boolean|object} [opts.handles]  Draggable keyframe handles.
 * @returns {CameraTrack}
 */

/**
 * A helm: integrates a 6-DOF device's rates into a pose and drives the target bound with `bind(target)` — a camera state, a `{ pos, rot }` or a `{ get, set }`.
 * @function poseHelm
 * @memberof Host
 * @param {object} [opts]
 * @param {string|ArrayLike<number>} [opts.from=tree.WORLD]  The frame rates act in: `tree.WORLD`, `tree.EYE`, `tree.SELF` or a matrix.
 * @param {number} [opts.deadzone]  Rates below it read as zero.
 * @param {object} [opts.bind]  The target, bound at creation.
 * @returns {PoseHelm} The helm, with `bind(target)` and `dispose()`.
 */

/**
 * A helm that flies a camera state body-relative.
 * @function cameraHelm
 * @memberof Host
 * @param {object} cam  The camera state flown.
 * @param {object} [opts]
 * @param {number} [opts.deadzone]  Rates below it read as zero.
 * @returns {PoseHelm} The helm, with `dispose()`.
 */

/**
 * A WebHID 6-DOF device — a SpaceMouse by default — feeding a helm.
 * @function hid
 * @memberof Host
 * @param {object} [opts]
 * @param {object} [opts.bind]  The helm fed.
 * @returns {object} The stream.
 */

/**
 * A gamepad feeding a helm, polled every tick.
 * @function gamepad
 * @memberof Host
 * @param {object} [opts]
 * @param {number} [opts.index=0]  Which gamepad.
 * @param {object} [opts.bind]  The helm fed.
 * @returns {object} The stream.
 */

/**
 * Fetch an image as an ImageBitmap, ready for `texture`.
 * @function image
 * @memberof Host
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<ImageBitmap>}
 */

/**
 * A hidden, muted video from a file or the user's camera, a texture source that `upload` refreshes.
 * @function video
 * @memberof Host
 * @param {object} opts
 * @param {string} [opts.src]  A video file.
 * @param {boolean|object} [opts.camera]  The user's camera instead: true, or getUserMedia video constraints.
 * @param {boolean} [opts.loop]
 * @returns {Video}
 */

/**
 * Draw with the 2D canvas API into a texture source.
 * @function raster
 * @memberof Host
 * @param {function(CanvasRenderingContext2D, number, number):void} draw  Called with the context, w and h.
 * @param {number} w
 * @param {number} h
 * @param {object} [opts]
 * @returns {ImageBitmap|HTMLCanvasElement}
 */

/**
 * Fetch an OBJ model as arrays — position and indices, normal and texcoord when present — that `twgl.createBufferInfoFromArrays` takes.
 * @function model
 * @memberof Host
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<object>}
 */

/**
 * The label layer: HTML text pinned to world points or screen pixels over the canvas, made on first use.
 * @constant {Labels} labels
 * @memberof Host
 */

/**
 * An orbit: dragging rotates `cam` about its center, two fingers pan, the wheel and a pinch dolly — only the pointer no handle grabbed.
 * @function orbit
 * @memberof Host
 * @param {object} cam  The camera state moved.
 * @param {object} [opts]
 * @param {number} [opts.rotate=0.005]  Radians per pixel.
 * @param {number} [opts.minDistance]
 * @param {number} [opts.maxDistance]
 * @returns {Orbit}
 */

/**
 * Stop the loop, remove every listener and dispose everything the host made.
 * @function dispose
 * @memberof Host
 */

/**
 * Apply this frame's unclaimed drags and wheel to the camera state; call after the handles' updates.
 * @function update
 * @memberof Orbit
 * @returns {boolean} Whether the camera moved.
 */

/**
 * Restore the camera state the orbit started from.
 * @function home
 * @memberof Orbit
 */

/**
 * Remove the orbit's listeners.
 * @function dispose
 * @memberof Orbit
 */

/**
 * Pin a label to a world point; it follows the point every `tick()`.
 * @function set
 * @memberof Labels
 * @param {string} id
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {object} [opts]
 * @param {number} [opts.dx]  Pixel offset x.
 * @param {number} [opts.dy]  Pixel offset y.
 * @returns {object}
 */

/**
 * Place a label at canvas pixels, y down.
 * @function setScreen
 * @memberof Labels
 * @param {string} id
 * @param {string} text
 * @param {number} sx
 * @param {number} sy
 * @param {object} [opts]
 * @returns {object}
 */

/**
 * Remove a label.
 * @function remove
 * @memberof Labels
 * @param {string} id
 */

/**
 * Remove every label.
 * @function clear
 * @memberof Labels
 */

/**
 * Reposition the world labels through the installed camera; once per frame, after `setCamera`.
 * @function tick
 * @memberof Labels
 * @returns {object}
 */

/**
 * Start playback.
 * @function start
 * @memberof Video
 * @returns {Promise<void>}
 */

/**
 * Pause.
 * @function stop
 * @memberof Video
 */

/**
 * Stop, release the camera and detach the element.
 * @function dispose
 * @memberof Video
 */

/**
 * Reset the helm's pose: to the one given, or to the identity.
 * @function home
 * @memberof PoseHelm
 * @param {{ pos?: ArrayLike<number>, rot?: ArrayLike<number> }} [pose]  Identity when omitted.
 * @returns {PoseHelm}
 */

/**
 * The helm's current pose.
 * @function eval
 * @memberof PoseHelm
 * @param {{ pos: number[], rot: number[] }} [out]
 * @returns {{ pos: number[], rot: number[] }} out
 */

/**
 * The six live channel rates `[Tx, Ty, Tz, Rp, Ry, Rr]`, after deadzone and sensitivity.
 * @function activity
 * @memberof PoseHelm
 * @param {number[]} out6  6-element destination.
 * @returns {number[]} out6
 */
