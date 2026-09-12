/**
 * @file A minimal WebGL2 stub for the bridge tests: the constants and calls
 *       the registry, the camera install and the pure helpers touch. Nothing
 *       here rasterizes; the browser harness under testing/ is the real gate.
 */

export function createGL({ width = 640, height = 480 } = {}) {
  const log = [];
  const gl = {
    drawingBufferWidth: width, drawingBufferHeight: height,
    log,
    TRIANGLES: 4, DEPTH_TEST: 2929, BLEND: 3042, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    RGBA: 6408, RGBA8: 32856, RGBA16F: 34842, HALF_FLOAT: 5131, UNSIGNED_BYTE: 5121,
    DEPTH_COMPONENT: 6402, DEPTH_COMPONENT24: 33190, UNSIGNED_INT: 5125, DEPTH_STENCIL: 34041,
    LINEAR: 9729, NEAREST: 9728, CLAMP_TO_EDGE: 33071,
    COLOR_ATTACHMENT0: 36064, DEPTH_ATTACHMENT: 36096, FRAMEBUFFER: 36160, VIEWPORT: 2978, FRAMEBUFFER_BINDING: 36006,
    deleteProgram(p) { log.push(['deleteProgram', p]); },
    deleteBuffer(b) { log.push(['deleteBuffer', b]); },
    getExtension() { return {}; },
  };
  return gl;
}
