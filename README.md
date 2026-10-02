# `webgl.tree`

[`@nakednous/tree`](https://github.com/nakednous/tree) and
[`@nakednous/host`](https://github.com/nakednous/host) on raw WebGL2 through
[twgl](https://twgljs.org/): a camera install that uploads only the transforms a program declares,
render targets in every shape, fullscreen filter passes and the ping-pong pipe, a line pipe that
draws the core's gizmo arrays, HUD mode, asynchronous colour-id scene picking, textures under one
orientation. No engine, no scene graph — twgl's own verbs stay yours.

[`webgl.tree`][webgl.tree] is an experimental implementation of the visual-computing notebook's
pseudo-code design, expected to rest on its foundations:
[`@nakednous/tree`](https://github.com/nakednous/tree)'s math, twgl's calls, and only what the
notebook's archetype columns write by hand and the notation leaves out. A hero that ports line for
line confirms a piece of the notation; one that cannot is where the notation changes.

> **Status: 0.0.x.** The surface below is shipped; the gizmo `width` mode is the one piece still
> unproven.

Repo · [nakednous/webgl.tree](https://github.com/nakednous/webgl.tree) — the source and the issues.
API site · [jpcharalambosh.co/webgl.tree](https://jpcharalambosh.co/webgl.tree/).

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
[`@nakednous/tree`](https://github.com/nakednous/tree) and
[`@nakednous/host`](https://github.com/nakednous/host) external, so a bundler or an import map
resolves them.

---

## Architecture

[`webgl.tree`][webgl.tree] is the bridge layer of an engine-free stack — the one place that touches
the GPU API. Its WebGPU twin, `webgpu.tree`, realizes the same surface.

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

[`@nakednous/ui`](https://github.com/nakednous/ui) is an optional peer of the application, not a
dependency of the bridge: a panel writes its `u*` names through a target sink, and [`bind`][bind]
reads them. Dependency direction is strict: `{ tree, host } ← webgl.tree`; nothing flows back.

**What it takes from twgl.** The ceremony, and nothing else:
[`twgl.createProgramInfo`][twgl.createProgramInfo] ·
[`twgl.createBufferInfoFromArrays`][twgl.createBufferInfoFromArrays] ·
[`twgl.setAttribInfoBufferFromArray`][twgl.setAttribInfoBufferFromArray] ·
[`twgl.setBuffersAndAttributes`][twgl.setBuffersAndAttributes] ·
[`twgl.setUniforms`][twgl.setUniforms] · [`twgl.drawBufferInfo`][twgl.drawBufferInfo] ·
[`twgl.createFramebufferInfo`][twgl.createFramebufferInfo] ·
[`twgl.resizeFramebufferInfo`][twgl.resizeFramebufferInfo] ·
[`twgl.bindFramebufferInfo`][twgl.bindFramebufferInfo] · [`twgl.createTexture`][twgl.createTexture] ·
[`twgl.setTextureFromElement`][twgl.setTextureFromElement]. The math is
[`@nakednous/tree`](https://github.com/nakednous/tree)'s, so [`twgl.m4`][twgl.m4], [`twgl.v3`][twgl.v3]
and [`twgl.primitives`][twgl.primitives] are never called — and twgl ships exactly that ceremony as
its **core** build ([`twgl.js`][twgl.js]), the full build (`twgl-full.js`) adding the math and the
generators. A consumer that needs no more than the bridge does can resolve [`twgl.js`][twgl.js] to
the core build (it is a UMD script: an import map wants a CDN's ESM transform of it, a bundler takes
it as it is), and a bundler that resolves the full ESM build instead shakes the unused math and
generators away on its own.

---

## The surface

Every export is a free function taking `gl` first; per-context state lives in a registry keyed
by `gl`, created on first use and released by [`dispose(gl)`][dispose]. Options object last. The
[API site](https://jpcharalambosh.co/webgl.tree/) documents every name below, one page per
module — the links go there.

| call | what it does |
|---|---|
| [`init(gl, { host, raf })`][init] · [`dispose(gl)`][dispose] · [`viewOf(gl)`][viewOf] | attach a host (its view bag receives the camera, its labels the gizmo anchors), release every GPU resource the bridge made, read the view bag a host-less application maps through |
| [`setCamera(gl, V, P)`][setCamera] · [`setCamera(gl, cam)`][setCamera] | install the view and projection every draw reads; the state form is the seam a track, a helm or the orbit fills |
| [`bind(gl, prog, uniforms)`][bind] | [`twgl.setUniforms`][twgl.setUniforms] over `gl.useProgram` |
| [`buffer(gl, arrays)`][buffer] | a twgl bufferInfo from the arrays shape — `host.loadMesh`'s mesh, a `loadModel` part's, `tree.platonic`'s, twgl's primitives — under the bridge's attribute names: `position` → `aPosition`, `normal` → `aNormal`, `tangent` → `aTangent`, `texcoord` → `aTexCoord`, `color` → `aColor`, `joints` → `aJoints` (unnormalised), `weights` → `aWeights`; any other key holding numbers keeps its own name — a **custom attribute** (`mesh.aHeat = { numComponents: 1, data }` → `in float aHeat`), or a renamed one for a shader written otherwise (`{ ...mesh, aUV: mesh.texcoord, texcoord: undefined }`) — the rest (a mesh's `bounds`, a generator's `count` and `labels`) are skipped — so a mesh from `host.loadMesh`, `tree.platonic` or a twgl primitive goes in whole |
| [`draw(gl, obj, M)`][draw] · [`drawInstanced(gl, obj, n, M)`][drawInstanced] | attributes, then the declared transforms — `uModelMatrix` · `uViewMatrix` · `uModelViewMatrix` · `uProjectionMatrix` · `uModelViewProjectionMatrix` · `uNormalMatrix`, each only if the program declares it — then [`twgl.drawBufferInfo`][twgl.drawBufferInfo]; an attribute the program declares and `obj` lacks reads GL's constant value, (0, 0, 0, 1) unless `gl.vertexAttrib*` set another — never an earlier draw's array — so meshes carrying different attributes share a program |
| [`renderTarget(gl, opts)`][renderTarget] · [`SCREEN`][SCREEN] | canvas-sized or `{ width, height }`; `{ depth: true }` a depth texture only; `{ depthTexture: true }` colour plus a sampleable depth; `{ color: ['a', 'b'] }` named multiple targets; `{ depth: false }` colour only; `{ float: true }` RGBA16F; `.color`, `.depth`, `.a`, `resize`, [`dispose`][dispose]; route passes with twgl's [`twgl.bindFramebufferInfo(gl, fbo)`][twgl.bindFramebufferInfo] |
| [`program(gl, frag)`][program] · [`fullscreen(gl)`][fullscreen] · [`filter(gl, prog, uniforms)`][filter] | a fullscreen pass from its fragment stage; the covering quad, `aTexCoord` bottom-up; bind + draw with the depth test off, `uSource` the image (bound as `tex0` too, for shaders written to p5's convention), `uResolution` and `uTexelSize` filled iff declared |
| [`image(gl, tex, { x, y, width, height, tint, mask, blend })`][image] | a texture onto the current target, rect in target pixels from the bottom-left, default cover; [`RED`][RED] … masks, [`NORMAL`][NORMAL] · [`ADD`][ADD] · [`MULTIPLY`][MULTIPLY] blends |
| [`pipe(gl, source, passes, opts)`][pipe] · [`releasePipe(gl, key)`][releasePipe] | the ping-pong chain over cached colour-only targets; passes are programs or `{ program, uniforms }`; `display`, `key`, `ping` / `pong`, `clear`, `clearFn`, [`draw`][draw] |
| [`axes`][axes] · [`grid`][grid] · [`hermite`][hermite] · [`viewFrustum`][viewFrustum] · [`trackPath`][trackPath] · [`helmRig`][helmRig] · [`handleLocus`][handleLocus] · [`pane`][pane] | the scene gizmos over the core generators: `(gl, subject?, { M, color, bits, size, depth, width })`; [`viewFrustum`][viewFrustum] takes a camera state, a track or `{ mat4Eye, mat4Proj }` plus `nearTexture` / `farTexture`; [`trackPath`][trackPath] draws markers and `HANDLES`; [`helmRig`][helmRig] orients to the helm's frame and, with `{ x, y, size, tilt }`, composites a corner readout; [`handleLocus`][handleLocus] draws a host handle's dot, aim and locus |
| [`beginHUD(gl)`][beginHUD] · [`endHUD(gl)`][endHUD] · [`cross`][cross] · [`bullsEye`][bullsEye] | an orthographic camera over the viewport in y-down pixels with the depth test off; the two screen-space gizmos wrap themselves in it when called outside |
| [`readPixel(gl, fbo, x, y)`][readPixel] · [`pick(gl, x, y, drawFn, opts)`][pick] | one pixel back through a PBO and a fence, polled on the bridge's own frame loop; colour-id scene picking on a 1×1 target through `mat4Pick`, `paint(id)` handed to `drawFn`, ids `1 … 2²⁴ − 1`, `0` a miss |
| [`texture(gl, source, opts)`][texture] · [`upload(gl, tex, source)`][upload] · [`cubemap(gl, faces, opts)`][cubemap] | over twgl's [`twgl.createTexture`][twgl.createTexture] and [`twgl.setTextureFromElement`][twgl.setTextureFromElement]; images and elements flipped into GL's bottom-up space at upload, so nothing downstream flips |
| [`mapLocation(gl, out, x, y, z, from, to)`][mapLocation] · [`mapDirection(gl, out, dx, dy, dz, from, to)`][mapDirection] · [`unproject(gl, outO, outD, sx, sy)`][unproject] · [`fragCoord(gl, out, x, y)`][fragCoord] · [`pixelRatio(gl, eyeZ)`][pixelRatio] · [`mat4Viewport(gl, out)`][mat4Viewport] | points, directions and rays between spaces through the installed camera and the current viewport; a screen-space pixel as `gl_FragCoord`; world units per logical pixel at an eye-space depth; the viewport matrix W, NDC to logical pixels |

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

Depth is the application's to clear; [`filter`][filter], [`image`][image] and the HUD disable it and
restore it. Texture orientation is GL's, settled at upload. The bridge tracks no current target:
twgl sets the viewport on bind and every bridge call reads it back.

---

## Seams

| seam | direction | contract |
|---|---|---|
| view bag | bridge → host | [`setCamera(gl, cam)`][setCamera] writes the attached host's `view`; without one, [`viewOf(gl)`][viewOf] |
| gizmo arrays | tree → bridge | the generators write the bridge's cached arrays; the returned count sizes the buffer, grown when exceeded |
| label anchors | tree → bridge → host | [`helmRig`][helmRig]'s `identify` anchors go to `host.labels` as one-frame labels |
| uniforms bag | [ui](https://github.com/nakednous/ui) → bridge | a panel's target writes `u*` names; [`bind(gl, prog, bag)`][bind] reads them |
| camera state | tree ↔ host ↔ bridge | plain data: a track, a helm, the orbit write it; the bridge only reads it |
| id program | application → bridge | [`pick`][pick]'s `opts.program` for a displaced surface; `paint` sets its `uColor` |

---

## Development

```bash
npm test                                          # node:test — the pure parts against a gl stub
npm run build                                     # rollup → dist/index.js, twgl.js external
```

---

## Acknowledgements

- [twgl](https://twgljs.org/) (Gregg Tavares) — the layer underneath: programs, buffers, textures, framebuffers; the arrays shape [`buffer`][buffer] takes is its own.
- The numeric core's and the host's acknowledgements — glTF 2.0, OBJ, three.js — are in [`@nakednous/tree`](https://github.com/nakednous/tree) and [`@nakednous/host`](https://github.com/nakednous/host).

## License

AGPL-3.0-only  
© JP Charalambos

<!-- The API site's pages for the names above: `npm run docs` checks every one of them. -->
[ADD]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.ADD
[MULTIPLY]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.MULTIPLY
[NORMAL]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.NORMAL
[RED]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.RED
[SCREEN]: https://jpcharalambosh.co/webgl.tree/target.html#webgl.tree/target.SCREEN
[axes]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.axes
[beginHUD]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.beginHUD
[bind]: https://jpcharalambosh.co/webgl.tree/draw.html#webgl.tree/draw.bind
[buffer]: https://jpcharalambosh.co/webgl.tree/draw.html#webgl.tree/draw.buffer
[bullsEye]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.bullsEye
[cross]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.cross
[cubemap]: https://jpcharalambosh.co/webgl.tree/texture.html#webgl.tree/texture.cubemap
[dispose]: https://jpcharalambosh.co/webgl.tree/context.html#webgl.tree/context.dispose
[draw]: https://jpcharalambosh.co/webgl.tree/draw.html#webgl.tree/draw.draw
[drawInstanced]: https://jpcharalambosh.co/webgl.tree/draw.html#webgl.tree/draw.drawInstanced
[endHUD]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.endHUD
[filter]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.filter
[fragCoord]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.fragCoord
[fullscreen]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.fullscreen
[grid]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.grid
[handleLocus]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.handleLocus
[helmRig]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.helmRig
[hermite]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.hermite
[image]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.image
[init]: https://jpcharalambosh.co/webgl.tree/context.html#webgl.tree/context.init
[mapDirection]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.mapDirection
[mapLocation]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.mapLocation
[mat4Viewport]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.mat4Viewport
[pane]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.pane
[pick]: https://jpcharalambosh.co/webgl.tree/pick.html#webgl.tree/pick.pick
[pipe]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.pipe
[pixelRatio]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.pixelRatio
[program]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.program
[readPixel]: https://jpcharalambosh.co/webgl.tree/pick.html#webgl.tree/pick.readPixel
[releasePipe]: https://jpcharalambosh.co/webgl.tree/pass.html#webgl.tree/pass.releasePipe
[renderTarget]: https://jpcharalambosh.co/webgl.tree/target.html#webgl.tree/target.renderTarget
[setCamera]: https://jpcharalambosh.co/webgl.tree/camera.html#webgl.tree/camera.setCamera
[texture]: https://jpcharalambosh.co/webgl.tree/texture.html#webgl.tree/texture.texture
[trackPath]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.trackPath
[twgl.bindFramebufferInfo]: https://twgljs.org/docs/module-twgl.html#.bindFramebufferInfo
[twgl.createBufferInfoFromArrays]: https://twgljs.org/docs/module-twgl.html#.createBufferInfoFromArrays
[twgl.createFramebufferInfo]: https://twgljs.org/docs/module-twgl.html#.createFramebufferInfo
[twgl.createProgramInfo]: https://twgljs.org/docs/module-twgl.html#.createProgramInfo
[twgl.createTexture]: https://twgljs.org/docs/module-twgl.html#.createTexture
[twgl.drawBufferInfo]: https://twgljs.org/docs/module-twgl.html#.drawBufferInfo
[twgl.js]: https://twgljs.org/
[twgl.m4]: https://twgljs.org/docs/module-twgl_m4.html
[twgl.primitives]: https://twgljs.org/docs/module-twgl_primitives.html
[twgl.resizeFramebufferInfo]: https://twgljs.org/docs/module-twgl.html#.resizeFramebufferInfo
[twgl.setAttribInfoBufferFromArray]: https://twgljs.org/docs/module-twgl.html#.setAttribInfoBufferFromArray
[twgl.setBuffersAndAttributes]: https://twgljs.org/docs/module-twgl.html#.setBuffersAndAttributes
[twgl.setTextureFromElement]: https://twgljs.org/docs/module-twgl_textures.html#.setTextureFromElement
[twgl.setUniforms]: https://twgljs.org/docs/module-twgl.html#.setUniforms
[twgl.v3]: https://twgljs.org/docs/module-twgl_v3.html
[unproject]: https://jpcharalambosh.co/webgl.tree/space.html#webgl.tree/space.unproject
[upload]: https://jpcharalambosh.co/webgl.tree/texture.html#webgl.tree/texture.upload
[viewFrustum]: https://jpcharalambosh.co/webgl.tree/gizmo.html#webgl.tree/gizmo.viewFrustum
[viewOf]: https://jpcharalambosh.co/webgl.tree/context.html#webgl.tree/context.viewOf
[webgl.tree]: https://github.com/nakednous/webgl.tree
