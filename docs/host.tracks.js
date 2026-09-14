/**
 * @file Tracks — keyframed poses and camera states, interpolated and played.
 * @module host.tracks
 * @license AGPL-3.0-only
 *
 * `canvasHost.poseTrack()` and `canvasHost.cameraTrack(cam)` make tracks the
 * host plays: add keyframes, `play()`, and read the moving pose each frame —
 * a camera track writes straight into its camera state. Positions follow a
 * smooth curve through the keyframes, rotations interpolate spherically.
 * Both tracks share the transport — `play`, `stop`, `seek`, `time`, `info`,
 * `remove`, `reset` — listed under PoseTrack. `trackPath` draws either.
 */

/**
 * Append keyframes: one `{ pos, rot, scl }` or an array of them.
 * @function add
 * @memberof PoseTrack
 * @param {object|object[]} spec  `pos: [x, y, z]`, `rot: [x, y, z, w]`, `scl: [x, y, z]`; missing fields take the identity.
 * @param {object} [opts]
 * @param {boolean} [opts.deduplicate]  Skip a keyframe equal to the last.
 */

/**
 * Replace the keyframe at an index, or append at the end.
 * @function set
 * @memberof PoseTrack
 * @param {number} index
 * @param {object} spec
 * @returns {boolean}
 */

/**
 * Remove the keyframe at an index.
 * @function remove
 * @memberof PoseTrack
 * @param {number} index
 * @returns {boolean}
 */

/**
 * Remove every keyframe and stop.
 * @function reset
 * @memberof PoseTrack
 * @returns {PoseTrack}
 */

/**
 * Play, or change how it plays.
 * @function play
 * @memberof PoseTrack
 * @param {number|object} [rateOrOpts]  A rate, or options.
 * @param {number} [rateOrOpts.duration=30]  Frames per segment.
 * @param {boolean} [rateOrOpts.loop]
 * @param {boolean} [rateOrOpts.bounce]  Play back and forth.
 * @param {number} [rateOrOpts.rate=1]
 * @param {function} [rateOrOpts.onEnd]
 * @returns {PoseTrack}
 */

/**
 * Stop playing.
 * @function stop
 * @memberof PoseTrack
 * @param {boolean} [rewind]  Also seek back to the end playback started from.
 * @returns {PoseTrack}
 */

/**
 * Move the playhead.
 * @function seek
 * @memberof PoseTrack
 * @param {number} t  0–1 across the whole track, or within segment `segIndex`.
 * @param {number} [segIndex]
 * @returns {PoseTrack}
 */

/**
 * The playhead's position, 0–1 across the whole track.
 * @function time
 * @memberof PoseTrack
 * @returns {number}
 */

/**
 * The transport's state: keyframes, segments, playing, loop, bounce, rate, duration, time.
 * @function info
 * @memberof PoseTrack
 * @returns {object}
 */

/**
 * The pose at the playhead.
 * @function eval
 * @memberof PoseTrack
 * @param {object} [out]  Destination `{ pos, rot, scl }`.
 * @returns {{ pos: number[], rot: number[], scl: number[] }} out
 */

/**
 * The pose at the playhead, or at a segment and parameter, as a model matrix.
 * @function mat4Model
 * @memberof PoseTrack
 * @param {Float32Array|number[]} out
 * @param {number} [seg]  Segment index; omitted, the playhead.
 * @param {number} [t]  0–1 within the segment.
 * @returns {Float32Array|number[]} out
 */

/**
 * A position on the path, at the playhead or at a segment and parameter.
 * @function samplePos
 * @memberof PoseTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 */

/**
 * The path's incoming and outgoing tangents at a keyframe.
 * @function tangents
 * @memberof PoseTrack
 * @param {number[]} outIn
 * @param {number[]} outOut
 * @param {number} index
 * @returns {PoseTrack}
 */

/**
 * Append camera keyframes: one `{ eye, center, up, fov, near, far }` or an array of them.
 * @function add
 * @memberof CameraTrack
 * @param {object|object[]} spec  A camera state's fields; `halfHeight` in place of `fov` for orthographic.
 * @param {object} [opts]
 * @param {boolean} [opts.deduplicate]  Skip a keyframe equal to the last.
 */

/**
 * Replace the camera keyframe at an index, or append at the end.
 * @function set
 * @memberof CameraTrack
 * @param {number} index
 * @param {object} spec
 * @returns {boolean}
 */

/**
 * The camera state at the playhead.
 * @function eval
 * @memberof CameraTrack
 * @param {object} [out]  Destination camera state.
 * @returns {object} out
 */

/**
 * The eye matrix (eye → world) at the playhead, or at a segment and parameter.
 * @function mat4Eye
 * @memberof CameraTrack
 * @param {Float32Array|number[]} out
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {Float32Array|number[]} out
 */

/**
 * An eye position on the path.
 * @function sampleEye
 * @memberof CameraTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 */

/**
 * A center position on the path.
 * @function sampleCenter
 * @memberof CameraTrack
 * @param {number[]} out  3-element destination.
 * @param {number} [seg]
 * @param {number} [t]
 * @returns {number[]} out
 */
