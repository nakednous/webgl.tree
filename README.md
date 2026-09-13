# `twgl.tree`

`@nakednous/tree` and `@nakednous/host` on raw WebGL2 through [twgl](https://twgljs.org/): a
camera install that uploads only the transforms a program declares, render targets in every
shape, fullscreen filter passes and the ping-pong pipe, a line pipe that draws the core's gizmo
arrays, HUD mode, asynchronous colour-id scene picking, textures under one orientation. No
engine, no scene graph — twgl's own verbs stay yours.

> **Status: 0.0.x.** The whole surface below is shipped; the harness under `testing/` runs the
> notebook's imaging, picking and portal heroes and every gizmo on the bridge with p5.tree
> beside for parity. The gizmo `width` mode is experimental.

---

## Installation

```bash
npm install twgl.tree twgl.js
```

```js
import * as twgl from 'twgl.js'
import { setCamera, bind, draw, renderTarget, program, pipe, axes } from 'twgl.tree'
import { createCamera } from '@nakednous/tree'

const gl = canvas.getContext('webgl2')
const prog = twgl.createProgramInfo(gl, [vert, frag])          // twgl's verb, not re-wrapped
const mesh = twgl.createBufferInfoFromArrays(gl, arrays)
const cam = createCamera({ eye: [0, 0, 800] })

function frame() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  setCamera(gl, cam)                                          // V and P installed once
  bind(gl, prog, { uColor: [1, 0.3, 0.8] })
  draw(gl, mesh, M)                                           // the declared transforms uploaded
  axes(gl, { size: 100 })
}
```

---

## Architecture

`twgl.tree` is the bridge layer of an engine-free stack — the one place that touches the GPU
API. Its WebGPU twin, `webgpu.tree`, realizes the same surface.

```
  application  (imports twgl itself — createProgramInfo, createBufferInfoFromArrays, …)
      │
      ▼
  twgl.tree                   ← this package: the GPU, thinly
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media, labels, orbit
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility, gizmo generators
      │
      └── twgl                ← peer dependency, external to the bundle
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host } ← twgl.tree`; nothing flows back.

---

## The surface

Every export is a free function taking `gl` first; per-context state lives in a registry keyed
by `gl`, created on first use and released by `dispose(gl)`. Options object last.

| call | what it does |
|---|---|
| `init(gl, { host, ndcZMin, raf })` · `dispose(gl)` · `viewOf(gl)` | attach a host (its view bag receives the camera, its labels the gizmo anchors), release every GPU resource the bridge made, read the view bag a host-less application maps through |
| `setCamera(gl, V, P)` · `setCamera(gl, cam)` | install the view and projection every draw reads; the state form is the seam a track, a helm or the orbit fills |
| `bind(gl, prog, uniforms)` | `useProgram` + `setUniforms` |
| `draw(gl, obj, M)` · `drawInstanced(gl, obj, n, M)` | attributes, then the declared transforms — `uModelMatrix` · `uViewMatrix` · `uModelViewMatrix` · `uProjectionMatrix` · `uModelViewProjectionMatrix` · `uNormalMatrix`, each only if the program declares it — then `drawBufferInfo` |
| `renderTarget(gl, opts)` · `SCREEN` | canvas-sized or `{ width, height }`; `{ depth: true }` a depth texture only; `{ depthTexture: true }` colour plus a sampleable depth; `{ color: ['a', 'b'] }` named multiple targets; `{ depth: false }` colour only; `{ float: true }` RGBA16F; `.color`, `.depth`, `.a`, `resize`, `dispose`; route passes with twgl's `bindFramebufferInfo(gl, fbo)` |
| `program(gl, frag)` · `fullscreen(gl)` · `filter(gl, prog, uniforms)` | a fullscreen pass from its fragment stage; the covering quad, `aTexCoord` bottom-up; bind + draw with the depth test off, `tex0` the image, `uResolution` and `uTexelSize` filled iff declared |
| `image(gl, tex, { x, y, width, height, tint, mask, blend })` | a texture onto the current target, rect in target pixels from the bottom-left, default cover; `RED` … masks, `NORMAL` · `ADD` · `MULTIPLY` blends |
| `pipe(gl, source, passes, opts)` · `releasePipe(gl, key)` | the ping-pong chain over cached colour-only targets; passes are programs or `{ program, uniforms }`; `display`, `key`, `ping` / `pong`, `clear`, `clearFn`, `draw` |
| `axes` · `grid` · `hermite` · `viewFrustum` · `trackPath` · `helmRig` · `handleLocus` · `pane` | the scene gizmos over the core generators: `(gl, subject?, { M, color, bits, size, depth, width })`; `viewFrustum` takes a camera state, a track or `{ mat4Eye, mat4Proj }` plus `nearTexture` / `farTexture`; `trackPath` draws markers and `HANDLES`; `helmRig` orients to the helm's frame and, with `{ x, y, size, tilt }`, composites a corner readout; `handleLocus` draws a host handle's dot, aim and locus |
| `beginHUD(gl)` · `endHUD(gl)` · `cross` · `bullsEye` | an orthographic camera over the viewport in y-down pixels with the depth test off; the two screen-space gizmos wrap themselves in it when called outside |
| `readPixel(gl, fbo, x, y)` · `pick(gl, x, y, drawFn, opts)` | one pixel back through a PBO and a fence, polled on the bridge's own frame loop; colour-id scene picking on a 1×1 target through `mat4Pick`, `paint(id)` handed to `drawFn`, ids `1 … 2²⁴ − 1`, `0` a miss |
| `texture(gl, source, opts)` · `upload(gl, tex, source)` · `cubemap(gl, faces, opts)` | over twgl's `createTexture` and `setTextureFromElement`; images and elements flipped into GL's bottom-up space at upload, so nothing downstream flips |

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

## License

AGPL-3.0-only  
© JP Charalambos
