/**
 * @file A minimal WebGL2 stub for the bridge tests: the constants and calls
 *       the registry, the camera install, the pass rule and the pure helpers
 *       touch. Nothing here rasterizes; the browser harness under testing/ is
 *       the real gate.
 */

// twgl tells a context object by its WebGL type tag, and only where the global
// class exists at all — neither is true in node, so the stub stands both up.
for (const name of ['WebGLTexture', 'WebGLFramebuffer', 'WebGLRenderbuffer', 'WebGLBuffer', 'WebGLProgram', 'WebGLVertexArrayObject']) {
  if (typeof globalThis[name] === 'undefined') globalThis[name] = class {};
}
const tagged = (name, obj) => { obj[Symbol.toStringTag] = name; return obj; };

export function createGL({ width = 640, height = 480 } = {}) {
  const log = [];
  let vertexArrays = 0;
  const gl = {
    drawingBufferWidth: width, drawingBufferHeight: height,
    log,
    get vertexArrays() { return vertexArrays; },
    TRIANGLES: 4, DEPTH_TEST: 2929, BLEND: 3042, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    RGBA: 6408, RGBA8: 32856, RGBA16F: 34842, RGBA32F: 34836, HALF_FLOAT: 5131, UNSIGNED_BYTE: 5121,
    DEPTH_COMPONENT: 6402, DEPTH_COMPONENT24: 33190, UNSIGNED_INT: 5125, DEPTH_STENCIL: 34041,
    LINEAR: 9729, NEAREST: 9728, CLAMP_TO_EDGE: 33071, REPEAT: 10497,
    DEPTH24_STENCIL8: 35056, DEPTH_STENCIL_ATTACHMENT: 33306, MAX_SAMPLES: 36183, NONE: 0,
    COLOR_ATTACHMENT0: 36064, DEPTH_ATTACHMENT: 36096, FRAMEBUFFER: 36160, VIEWPORT: 2978, FRAMEBUFFER_BINDING: 36006,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044, FLOAT: 5126,
    ACTIVE_UNIFORMS: 35718, SAMPLER_2D: 35678, SAMPLER_CUBE: 35680, SAMPLER_2D_ARRAY: 36289,
    LESS: 513, LEQUAL: 515,
    SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771, ONE: 1, ZERO: 0, DST_COLOR: 774,
    BLEND_SRC_RGB: 32969, BLEND_DST_RGB: 32968, BLEND_SRC_ALPHA: 32971, BLEND_DST_ALPHA: 32970,
    blendFunc(src, dst) { gl.blend = [src, dst]; log.push(['blendFunc', src, dst]); },
    blendFuncSeparate(src, dst, srcA, dstA) { gl.blend = [src, dst, srcA, dstA]; log.push(['blendFuncSeparate', src, dst, srcA, dstA]); },
    depthFunc(f) { log.push(['depthFunc', f]); },
    deleteProgram(p) { log.push(['deleteProgram', p]); },
    deleteBuffer(b) { log.push(['deleteBuffer', b]); },
    getExtension() { return {}; },
    disableVertexAttribArray(location) { log.push(['disableVertexAttribArray', location]); },
    enableVertexAttribArray(location) { log.push(['enableVertexAttribArray', location]); },
    vertexAttribPointer(location) { log.push(['vertexAttribPointer', location]); },
    createVertexArray() { const v = tagged('WebGLVertexArrayObject', { id: ++vertexArrays }); log.push(['createVertexArray', v.id]); return v; },
    bindVertexArray(v) { gl.boundVertexArray = v || null; log.push(['bindVertexArray', v ? v.id : null]); },
    deleteVertexArray(v) { log.push(['deleteVertexArray', v ? v.id : null]); },
    createBuffer() { const b = tagged('WebGLBuffer', { id: ++gl.buffers }); log.push(['createBuffer', b.id]); return b; },
    bindBuffer(target, b) { gl.bound = b; },
    bufferData(target, data) { if (gl.bound) gl.bound.size = data.byteLength; log.push(['bufferData', gl.bound ? gl.bound.id : null, data.length]); },
    getBufferParameter() { return gl.bound ? gl.bound.size : 0; },
    useProgram(p) { gl.program = p; },
    drawArrays() { log.push(['drawArrays']); },
    drawElements() { log.push(['drawElements']); },
    drawElementsInstanced() { log.push(['drawElementsInstanced']); },
    isEnabled(cap) { return cap === gl.DEPTH_TEST ? !!gl.depthTest : cap === gl.BLEND ? !!gl.blendTest : false; },
    enable(cap) { if (cap === gl.DEPTH_TEST) gl.depthTest = true; else if (cap === gl.BLEND) gl.blendTest = true; },
    disable(cap) { if (cap === gl.DEPTH_TEST) gl.depthTest = false; else if (cap === gl.BLEND) gl.blendTest = false; },
    clearColor(r, g, b, a) { gl.clearColorValue = [r, g, b, a]; log.push(['clearColor', r, g, b, a]); },
    clear(mask) { gl.clears.push(mask); log.push(['clear', mask]); },
    viewport(x, y, w, h) { gl.viewport4 = [x, y, w, h]; },
    // framebuffers, textures and renderbuffers — renderTarget's side. The bound
    // framebuffer is tracked so that a verb restoring it can be asserted.
    TEXTURE_2D: 3553, TEXTURE0: 33984, FRAMEBUFFER_COMPLETE: 36053,
    TEXTURE_3D: 32879, TEXTURE_2D_ARRAY: 35866, TEXTURE_CUBE_MAP: 34067,
    RED: 6403, RG: 33319, RGB: 6407,
    R8: 33321, RG8: 33323, RGB8: 32849,
    R32F: 33326, RG32F: 33328, RGB32F: 34837,
    R16F: 33325, RG16F: 33327, RGB16F: 34843,
    LINEAR_MIPMAP_LINEAR: 9987, UNPACK_ALIGNMENT: 3317, UNPACK_FLIP_Y_WEBGL: 37440,
    READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, COLOR_CLEAR_VALUE: 3106,
    READ_FRAMEBUFFER_BINDING: 36010, DRAW_FRAMEBUFFER_BINDING: 36011,
    createFramebuffer() { const f = tagged('WebGLFramebuffer', { id: ++gl.framebuffers }); log.push(['createFramebuffer', f.id]); return f; },
    bindFramebuffer(target, fb) { gl.boundFramebuffer = fb; log.push(['bindFramebuffer', target, fb ? fb.id : null]); },
    deleteFramebuffer(f) { log.push(['deleteFramebuffer', f ? f.id : null]); },
    checkFramebufferStatus() { return gl.FRAMEBUFFER_COMPLETE; },
    createTexture() { const t = tagged('WebGLTexture', { id: ++gl.textures }); log.push(['createTexture', t.id]); return t; },
    bindTexture(target, t) { gl.boundTexture = t; },
    deleteTexture(t) { log.push(['deleteTexture', t ? t.id : null]); },
    texImage2D(...args) { log.push(['texImage2D', ...args]); },
    texImage3D(...args) { log.push(['texImage3D', ...args]); },
    generateMipmap(target) { log.push(['generateMipmap', target]); },
    pixelStorei(pname, value) { log.push(['pixelStorei', pname, value]); },
    texParameteri() {},
    activeTexture() {},
    drawBuffers() {},
    createRenderbuffer() { const r = tagged('WebGLRenderbuffer', { id: ++gl.renderbuffers }); return r; },
    bindRenderbuffer() {}, renderbufferStorage() {}, framebufferRenderbuffer() {},
    framebufferTexture2D() {}, deleteRenderbuffer() {},
    getParameter(pname) {
      if (pname === gl.VIEWPORT) return gl.viewport4 || [0, 0, width, height];
      if (pname === gl.FRAMEBUFFER_BINDING) return gl.boundFramebuffer || null;
      if (pname === gl.COLOR_CLEAR_VALUE) return gl.clearColorValue || [0, 0, 0, 0];
      return null;
    },
    clears: [], framebuffers: 0, textures: 0, renderbuffers: 0, boundFramebuffer: null,
    clearColorValue: [0, 0, 0, 0], viewport4: [0, 0, width, height], depthTest: false,
    // program inspection — samplersOf's side: a program object → its uniforms
    activeUniforms: new WeakMap(),
    getProgramParameter(p, pname) { return pname === gl.ACTIVE_UNIFORMS ? (gl.activeUniforms.get(p) || []).length : 0; },
    getActiveUniform(p, i) { return (gl.activeUniforms.get(p) || [])[i]; },
    buffers: 0, bound: null,
  };
  return gl;
}
