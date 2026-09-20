# `webgl.tree`

`@nakednous/tree` and `@nakednous/host` on raw WebGL2 through [twgl](https://twgljs.org/): a
camera install that uploads only the transforms a program declares, render targets in every
shape, fullscreen filter passes and the ping-pong pipe, a line pipe that draws the core's gizmo
arrays, HUD mode, asynchronous colour-id scene picking, textures under one orientation. No
engine, no scene graph — twgl's own verbs stay yours.

`webgl.tree` is an experimental implementation of the visual-computing notebook's pseudo-code
design, expected to rest on its foundations: `@nakednous/tree`'s math, twgl's calls, and only
what the notebook's archetype columns write by hand and the notation leaves out. A hero that ports line for line confirms a
piece of the notation; one that cannot is where the notation changes.

> **Status: 0.0.x.** The whole surface below is shipped; the harness under `testing/` runs the
> notebook's imaging, picking and portal heroes and every gizmo on the bridge with p5.tree
> beside for parity. The gizmo `width` mode is experimental.

---

## Installation

Two script tags, twgl.js first; webgl.tree reads the global `twgl` and exposes the global
`webglTree`:

```html
<script src="https://cdn.jsdelivr.net/npm/twgl.js@7/dist/7.x/twgl-full.js"></script>
<script src="https://cdn.jsdelivr.net/npm/webgl.tree/dist/webgl.tree.js"></script>
```

```js
const { createCanvas, setCamera, bind, draw, axes, tree } = webglTree

const gl = createCanvas(400, 300)                              // buffer at the display's pixel density
const prog = twgl.createProgramInfo(gl, [vert, frag])          // twgl's verb, not re-wrapped
const mesh = twgl.createBufferInfoFromArrays(gl, arrays)
const cam = tree.createCamera({ eye: [0, 0, 800] })

function frame() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  setCamera(gl, cam)                                          // V and P installed once
  bind(gl, prog, { uColor: [1, 0.3, 0.8] })
  draw(gl, mesh, M)                                           // the declared transforms uploaded
  axes(gl, { size: 100 })
}
```

`tree` holds the math — matrices, quaternions, camera states, visibility; `host` holds the canvas
host — handles, tracks, orbit, devices, media. For ES modules, `npm install webgl.tree twgl.js`
and `import { setCamera, axes, tree } from 'webgl.tree'`; the ES build keeps twgl.js,
`@nakednous/tree` and `@nakednous/host` external, so a bundler or an import map resolves them.

---

## Architecture

`webgl.tree` is the bridge layer of an engine-free stack — the one place that touches the GPU
API. Its WebGPU twin, `webgpu.tree`, realizes the same surface.

```
  application  (imports twgl itself — createProgramInfo, createBufferInfoFromArrays, …)
      │
      ▼
  webgl.tree                  ← this package: the GPU, thinly
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media, labels, orbit
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility, gizmo generators
      │
      └── twgl                ← peer dependency, external to the bundle
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host } ← webgl.tree`; nothing flows back.

---

## The surface

Every export is a free function taking `gl` first; per-context state lives in a registry keyed
by `gl`, created on first use and released by `dispose(gl)`. Options object last.

| call | what it does |
|---|---|
| `init(gl, { host, raf })` · `dispose(gl)` · `viewOf(gl)` | attach a host (its view bag receives the camera, its labels the gizmo anchors), release every GPU resource the bridge made, read the view bag a host-less application maps through |
| `setCamera(gl, V, P)` · `setCamera(gl, cam)` | install the view and projection every draw reads; the state form is the seam a track, a helm or the orbit fills |
| `bind(gl, prog, uniforms)` | `useProgram` + `setUniforms` |
| `buffer(gl, arrays)` | a twgl bufferInfo from the arrays shape — `host.loadMesh`'s mesh, a `loadModel` part's, `tree.platonic`'s, twgl's primitives — under the bridge's attribute names: `position` → `aPosition`, `normal` → `aNormal`, `tangent` → `aTangent`, `texcoord` → `aTexCoord`, `color` → `aColor`, `joints` → `aJoints` (unnormalised), `weights` → `aWeights`; any other key holding numbers keeps its own name — a **custom attribute** (`mesh.aHeat = { numComponents: 1, data }` → `in float aHeat`), or a renamed one for a shader written otherwise (`{ ...mesh, aUV: mesh.texcoord, texcoord: undefined }`) — the rest (a mesh's `bounds`, a generator's `count` and `labels`) are skipped — so a mesh from `host.loadMesh`, `tree.platonic` or a twgl primitive goes in whole |
| `draw(gl, obj, M)` · `drawInstanced(gl, obj, n, M)` | attributes, then the declared transforms — `uModelMatrix` · `uViewMatrix` · `uModelViewMatrix` · `uProjectionMatrix` · `uModelViewProjectionMatrix` · `uNormalMatrix`, each only if the program declares it — then `drawBufferInfo`; an attribute the program declares and `obj` lacks reads GL's constant value, (0, 0, 0, 1) unless `gl.vertexAttrib*` set another — never an earlier draw's array — so meshes carrying different attributes share a program |
| `renderTarget(gl, opts)` · `SCREEN` | canvas-sized or `{ width, height }`; `{ depth: true }` a depth texture only; `{ depthTexture: true }` colour plus a sampleable depth; `{ color: ['a', 'b'] }` named multiple targets; `{ depth: false }` colour only; `{ float: true }` RGBA16F; `.color`, `.depth`, `.a`, `resize`, `dispose`; route passes with twgl's `bindFramebufferInfo(gl, fbo)` |
| `program(gl, frag)` · `fullscreen(gl)` · `filter(gl, prog, uniforms)` | a fullscreen pass from its fragment stage; the covering quad, `aTexCoord` bottom-up; bind + draw with the depth test off, `uSource` the image (bound as `tex0` too, for shaders written to p5's convention), `uResolution` and `uTexelSize` filled iff declared |
| `image(gl, tex, { x, y, width, height, tint, mask, blend })` | a texture onto the current target, rect in target pixels from the bottom-left, default cover; `RED` … masks, `NORMAL` · `ADD` · `MULTIPLY` blends |
| `pipe(gl, source, passes, opts)` · `releasePipe(gl, key)` | the ping-pong chain over cached colour-only targets; passes are programs or `{ program, uniforms }`; `display`, `key`, `ping` / `pong`, `clear`, `clearFn`, `draw` |
| `axes` · `grid` · `hermite` · `viewFrustum` · `trackPath` · `helmRig` · `handleLocus` · `pane` | the scene gizmos over the core generators: `(gl, subject?, { M, color, bits, size, depth, width })`; `viewFrustum` takes a camera state, a track or `{ mat4Eye, mat4Proj }` plus `nearTexture` / `farTexture`; `trackPath` draws markers and `HANDLES`; `helmRig` orients to the helm's frame and, with `{ x, y, size, tilt }`, composites a corner readout; `handleLocus` draws a host handle's dot, aim and locus |
| `beginHUD(gl)` · `endHUD(gl)` · `cross` · `bullsEye` | an orthographic camera over the viewport in y-down pixels with the depth test off; the two screen-space gizmos wrap themselves in it when called outside |
| `readPixel(gl, fbo, x, y)` · `pick(gl, x, y, drawFn, opts)` | one pixel back through a PBO and a fence, polled on the bridge's own frame loop; colour-id scene picking on a 1×1 target through `mat4Pick`, `paint(id)` handed to `drawFn`, ids `1 … 2²⁴ − 1`, `0` a miss |
| `texture(gl, source, opts)` · `upload(gl, tex, source)` · `cubemap(gl, faces, opts)` | over twgl's `createTexture` and `setTextureFromElement`; images and elements flipped into GL's bottom-up space at upload, so nothing downstream flips |
| `mapLocation(gl, out, x, y, z, from, to)` · `mapDirection(gl, out, dx, dy, dz, from, to)` · `unproject(gl, outO, outD, sx, sy)` · `fragCoord(gl, out, x, y)` · `pixelRatio(gl, eyeZ)` · `mat4Viewport(gl, out)` | points, directions and rays between spaces through the installed camera and the current viewport; a canvas pixel as `gl_FragCoord`; world units per canvas pixel at an eye-space depth; the viewport matrix W, NDC to canvas pixels |

Not exported: the internal flat, line, wide-line and pass-through programs. A hero binds its
own shaders.

---

## The frame

```
setCamera(gl, cam)                 // 1  install V and P; the host's view bag follows
if (!h.update()) orbit.update()    // 2  the host's handles, then the orbit on what they left
bindFramebufferInfo(gl, target)    // 3  route a pass with twgl's verb; gl.clear is yours
bind(gl, prog, uniforms)           // 4
draw(gl, mesh, M)                  // 5  the declared transforms uploaded
axes(gl) · trackPath(gl, track)    // 6  gizmos, each binding and restoring its own program
pipe(gl, target, passes)           // 7  post, displayed through image
beginHUD(gl) … endHUD(gl)          // 8  screen space
```

Depth is the application's to clear; `filter`, `image` and the HUD disable it and restore it.
Texture orientation is GL's, settled at upload. The bridge tracks no current target: twgl sets
the viewport on bind and every bridge call reads it back.

---

## Seams

| seam | direction | contract |
|---|---|---|
| view bag | bridge → host | `setCamera(gl, cam)` writes the attached host's `view`; without one, `viewOf(gl)` |
| gizmo arrays | tree → bridge | the generators write the bridge's cached arrays; the returned count sizes the buffer, grown when exceeded |
| label anchors | tree → bridge → host | `helmRig`'s `identify` anchors go to `host.labels` as one-frame labels |
| uniforms bag | ui → bridge | a panel's target writes `u*` names; `bind(gl, prog, bag)` reads them |
| camera state | tree ↔ host ↔ bridge | plain data: a track, a helm, the orbit write it; the bridge only reads it |
| id program | application → bridge | `pick`'s `opts.program` for a displaced surface; `paint` sets its `uColor` |

---

## Development

```bash
npm test                                          # node:test — the pure parts against a gl stub
npm run build                                     # rollup → dist/index.js, twgl.js external
npx browser-sync start --config bs-config.cjs     # the harness under testing/
```

---

## Acknowledgements

- [twgl](https://twgljs.org/) (Gregg Tavares) — the layer underneath: programs, buffers, textures, framebuffers; the arrays shape `buffer` takes is its own.
- The numeric core's and the host's acknowledgements — glTF 2.0, OBJ, three.js — are in [`@nakednous/tree`](https://github.com/nakednous/tree) and [`@nakednous/host`](https://github.com/nakednous/host).

## License

AGPL-3.0-only  
© JP Charalambos
