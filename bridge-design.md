# `webgl.tree` — the WebGL2 bridge (design)

> Target: `webgl.tree` 0.0.1 on `@nakednous/tree` 0.0.28+, `@nakednous/host` 0.0.1, and
> `twgl.js` ≥ 5.5.4 as a peer. `webgpu.tree` realizes this same surface (`twin-design.md`).
> The apex is `stack-design.md` in the tree repo; this doc owns the bridge's surface at
> implementation depth. The reference for every ported behaviour is
> `p5.tree/src/{gizmos,hud,pipe,picking}.js`.
> Status: **design only** — no code. Names marked *(provisional)* are open to veto.

---

## 1 · Scope — the framework line

The notebook's pseudo-host separates a framework — what "fills the built-in transforms
from its camera and model state, so a bare `scene()` supplies them silently" — from a
no-framework host that "uploads each by hand." The bridge is that framework and nothing
more:

- **Supplied** (the notation's silences, made mechanical): the declared transforms a draw
  uploads; the camera a `setCamera` installs; the composite verbs `bind`, `draw`,
  `drawInstanced`, `renderTarget`, `program(frag)`, `filter`, `fullscreen`, `image`,
  `readPixel`, `upload`; the pipe chain; the gizmo line pipe and HUD. No public programs:
  the ones the verbs need stay internal (§11).
- **Never re-wrapped** (the notation's explicit verbs, the JavaScript column's own):
  `createProgramInfo`, `createBufferInfoFromArrays`, `primitives.*`, `setUniforms`,
  `drawBufferInfo`, `bindFramebufferInfo`, `gl.clear`, `gl.cullFace`, `gl.enable`. A hero
  imports twgl itself and calls these directly; the bridge calls them too, and hides none.

So a `webgl.tree` hero is the pseudo-host with twgl's verbs still visible, and the only
things left to dissolve are the overlay (gizmos, HUD, orbit, panels) and the built-in the
hero binds.

---

## 2 · Layering

```
@nakednous/tree    matrices, camera state, gizmo arrays, mat4Pick, the id codec
@nakednous/host    the view bag a setCamera fills; labels the gizmos anchor into
twgl.js            the thin layer — programs, buffers, textures, framebuffers, draws
       ↑
webgl.tree         this package — one registry entry per gl context
       ↑
application  (+ @nakednous/ui as an optional peer, writing the uniforms bag)
```

`{ tree, host } ← webgl.tree`; twgl is a peer; nothing flows back.

---

## 3 · Call shape — `gl` first, state per context *(provisional)*

Every export is a free function taking `gl` first, mirroring twgl, so a hero's imports stay
flat (`import { setCamera, draw, filter } from 'webgl.tree'`) and the notation's verbs map
one-to-one. Per-context state — the installed camera, the cached fullscreen geometry, the
supplied programs, the gizmo buffers, the pick resources, the pipe caches, the HUD save —
lives in a registry keyed by `gl` (a `WeakMap`), created lazily on first use and released
by `dispose(gl)`.

```js
init(gl, { host, ndcZMin })   // optional: pre-create the entry, attach a host, override defaults
dispose(gl)                   // release every GPU resource the bridge created for this context
```

`host` attached at `init` (or passed per call as `{ host }`) is where `setCamera` writes the
view bag and where gizmo label anchors go. Without a host the bridge keeps its own view
matrices and gizmo labels are dropped.

---

## 4 · Camera — `setCamera`

```js
setCamera(gl, V, P, opts)     // from matrices
setCamera(gl, cam, opts)      // from camera state: V = cameraView(cam), P = cameraProj(cam, aspect, WEBGL)
```

Copies `V` and `P` into the context, recomputes `PV`, and — with a host — calls
`host.view.set(P, V)` (or `host.view.setCamera(cam)`), so the host's handles, router,
labels and orbit see the same camera the draws use. `aspect` is `drawingBufferWidth /
drawingBufferHeight` unless `opts.aspect`. The state form is the seam a track, a helm, an
orbit or a measured pose fills: they write `cam`; the frame calls `setCamera(gl, cam)`.

`viewOf(gl)` returns the context's view bag for a host-less application that wants to call
`mapLocation` itself.

---

## 5 · Draw — `bind` · `draw` · `drawInstanced`

```js
bind(gl, prog, uniforms)           // gl.useProgram + twgl.setUniforms; uniforms may be omitted
draw(gl, obj, M, opts)             // obj: a twgl bufferInfo; M: mat4 or omitted (identity)
drawInstanced(gl, obj, n, M, opts) // the same with an instance count
```

`draw` is `setBuffersAndAttributes` on the bound program, then **the declared transforms**,
then `drawBufferInfo`. The transforms are computed into context scratch — `MV = V · M`,
`MVP = P · MV`, `N = (MV)⁻ᵀ` — and each is uploaded **only if the bound program declares
it**, read off `programInfo.uniformSetters` once per program and cached:

| declared name | value |
|---|---|
| `uModelMatrix` | `M` |
| `uViewMatrix` | `V` |
| `uModelViewMatrix` | `V · M` |
| `uProjectionMatrix` | `P` |
| `uModelViewProjectionMatrix` | `P · V · M` |
| `uNormalMatrix` | `(V · M)⁻ᵀ`, 3×3 |

A fullscreen pass declares none and gets none; a shadow capture that declares
`uModelMatrix` and its own light matrix gets `uModelMatrix` and nothing the bridge would
mistake for the light's — the bridge never sets a name outside this table. The name set is
pending decision #10 in the apex; the mechanism does not depend on it.

`opts`: `{ mode, count, offset }` forwarded to `drawBufferInfo`. `M` is a `mat4`; a pose is
the application's `transformToMat4` first. Zero allocation per draw.

---

## 6 · Targets — `renderTarget` · `SCREEN`

```js
renderTarget(gl)                              // canvas-sized, color + depth renderbuffer
renderTarget(gl, { width, height })           // sized
renderTarget(gl, { depth: true })             // depth texture only — a shadow map
renderTarget(gl, { depthTexture: true })      // color + a sampleable depth texture — dof
renderTarget(gl, { color: ['albedo', 'normal', 'position'] })   // multiple targets — a g-buffer
```

Over `twgl.createFramebufferInfo`, returning its `framebufferInfo` extended with: `.color`
(attachment 0's texture), `.depth` (the depth texture when sampleable), one property per
named attachment (`fbo.albedo`), `.width` / `.height`, `resize(w, h)`
(`resizeFramebufferInfo`), `dispose()`. The multi-target form calls `gl.drawBuffers` on
bind; attachment order is the list order, so a fragment shader's `layout(location = i)`
matches the name at index `i`. Formats: `RGBA8` unless `{ float: true }` (`RGBA16F`);
depth `DEPTH_COMPONENT24`.

Passes are routed with twgl's own verb — `bindFramebufferInfo(gl, fbo)` — and `SCREEN` is
the exported constant `null` for readability: `bindFramebufferInfo(gl, SCREEN)`. The bridge
tracks no current target; twgl sets the viewport on bind, and every bridge call that needs
the target size reads `gl.getParameter(gl.VIEWPORT)`.

---

## 7 · Passes — `program(frag)` · `fullscreen` · `filter` · `image` · `pipe`

**`program(gl, frag)`** — a fullscreen-pass program: the given fragment source with the
bridge's fixed vertex stage, which passes `aPosition` through in NDC and emits `vTexCoord`.
The two-argument program is twgl's `createProgramInfo` — the bridge does not re-wrap it.

**`fullscreen(gl)`** — the cached covering geometry: two triangles in NDC with
`aTexCoord` **bottom-up** (`v = 0` at the bottom), GL's own orientation and the one the
Archetypes' texture and pixelator rows already use. A filter that only samples `tex0` at
`vTexCoord` is orientation-free; one that uses `vTexCoord.y` spatially reads GL's
orientation, not p5's top-down `vTexCoord`.

**`filter(gl, prog, uniforms)`** — `bind(prog, uniforms)` with depth test off, then
`draw(fullscreen)`. The source image is `uniforms.tex0`; the bridge fills `uResolution`
(the current viewport) and `uTexelSize` (`[1/w, 1/h]` of `tex0`) **iff declared**, the
notebook's conventions.

**`image(gl, tex, opts)`** — draw a texture to the current target: `{ x, y, width, height }`
in target pixels (default: cover), `tint` (a multiplier, default white), `mask`
(`colorMask`, e.g. `RED`), `blend` (`NORMAL` · `ADD` · `MULTIPLY` · …, restored after),
depth test off. Through the internal flat program. No flip option: orientation is settled at upload
(§9).

**`pipe(gl, source, passes, opts)`** — the ping-pong chain, ported from `p5.tree/src/pipe.js`:
`source` a texture or a target (its `.color`), `passes` one program or an array (falsy
entries skipped, each from `program(frag)`), `opts` `{ display = true, allocate = true, key
= 'default', ping, pong, clear = true, clearFn, clearDisplay, clearDisplayFn, draw }` with
the same semantics — keyed internal ping / pong cached per context and resized to the
source, user-supplied ping / pong never cached, `readTex` chained as `tex0`, the final
target returned, displayed through `image` when `display`. `releasePipe(gl, key | true)`
frees the cached targets.

---

## 8 · Picking — `readPixel` · `pick`

**`readPixel(gl, fbo, x, y) → Promise<Uint8Array>`** — one pixel back, asynchronously:
bind `fbo`, `readPixels` into a `PIXEL_PACK_BUFFER`, `fenceSync`, then poll
`clientWaitSync(sync, 0, 0)` on `requestAnimationFrame` until signaled, `getBufferSubData`
into a four-byte result, resolve. The poll is the bridge's own raf loop, running only while
readbacks are pending, so no application or host hook is needed and the surface matches
`mapAsync` on the twin. Results land one or more frames late by construction — the
notation's data-dependency reading.

**`pick(gl, x, y, drawFn, opts) → Promise<number>`** — colour-ID scene picking: a cached 1×1
target; the installed projection copied and narrowed with `mat4Pick(P, x, y, vp)`;
`setCamera(gl, V, Ppick)` installed for the pass and the previous camera restored after;
the target cleared to id `0`; the internal flat program bound unless `opts.program`; then `drawFn(paint)`,
where `paint(id)` sets the bound program's `uColor` to `idToRgba(id)` — the counterpart of
`fill(tag(id))`; then `readPixel` on the target, decoded with `rgbaToId`. `0` is a miss;
ids `1 … 2²⁴ − 1`.

```js
const hit = await pick(gl, x, y, paint => {
  paint(1); draw(gl, box, M1)
  paint(2); draw(gl, sphere, M2)
})
```

Handles never come here: their grab path is the core's analytic proxy through the host.
This is scene picking only.

---

## 9 · Textures — `texture` · `upload` · `cubemap`

```js
texture(gl, source, opts)     // create from an ImageBitmap, element, or pixels
upload(gl, tex, source)       // refresh an existing texture from a video / camera element
cubemap(gl, faces, opts)      // six sources → a cube map
```

Over `createTexture` / `setTextureFromElement`. **One orientation rule**: every texture
the bridge holds is in GL's bottom-up space. Decoded images and elements arrive top-down and
are uploaded with `flipY` on; a render target's texture is already bottom-up and never
passes through `upload`. Consequently `image`, `pane`, `filter` and the pick pass carry no
flip switch, and the p5 distinction between default and framebuffer UVs disappears — the
default pane UVs map the top-left corner to `v = 1`. `opts`: `{ minMag, wrap, mipmaps }`.
The glTF adapter's `load` lands here later.

---

## 10 · Gizmos — the line pipe, HUD, panes

**The pipe.** One program per context: `aPosition`, optional `aColor`, uniforms `uPV`,
`uModel`, `uColor`; drawn as `gl.LINES`. Each gizmo owns one cached `bufferInfo` per
context, allocated from the generator's returned count and grown when it exceeds capacity;
per frame the generator writes into the cached array and `setAttribInfoBufferFromArray`
re-uploads it — zero allocation once warm. Depth test on by default; `{ depth: false }`
for overlays. One-pixel GL lines; a width option is pending decision #2 and, if it comes,
lives here as a quad-strip mode — the generators never change.

**The calls** — thin generator-then-draw wrappers, each `(gl, subject?, opts)` with
`{ M, color, bits, size, … }`, no ambient state, names as in `p5.tree`:

| call | core generator | notes |
|---|---|---|
| `axes(gl, opts)` | `axesLines` | semantic colour per axis unless `opts.color`; `LABELS` anchors forwarded to `host.labels` |
| `grid(gl, opts)` | `gridLines` | in the XY plane; `M` orients it |
| `cross(gl, opts)` · `bullsEye(gl, opts)` | `crossLines` · `bullsEyeLines` | HUD-space, at `{ x, y }` in target px; world anchoring is `mapLocation` in the sketch |
| `hermite(gl, p0, t0, p1, t1, opts)` | `hermiteLines` | |
| `viewFrustum(gl, opts)` | `frustumLines` | `opts.camera`: a camera state, a `CameraTrack` (sampled at its cursor), or `{ mat4Eye, mat4Proj }`; `NEAR` / `FAR` / `BODY` / `APEX` bits; `nearTexture` / `farTexture` drawn as panes |
| `trackPath(gl, track, opts)` | `pathLines` | `PATH` · `CENTER` · `CONTROLS` · `TANGENTS` · `HANDLES` bits; `marker` (default a small `axes` per keyframe, `null` to omit); `HANDLES` draws each `track.handles` member through `handleLocus` |
| `helmRig(gl, helm, opts)` | `helmRigLines` | in-scene at `M`, oriented to the resolved `from`; the HUD overload `{ x, y, size, tilt }` renders to a small cached target through its own ortho camera and composites with `image` — `tint` applies, as in p5 |
| `handleLocus(gl, h, opts)` *(provisional)* | `locusLines` | the handle's dot · aim · locus · ring by bits; the dot at constant pixels via `pixelRatio`; the p5 `h.draw()` as a free gizmo — pending decision #13 |
| `pane(gl, p0, p1, p2, p3, opts)` | `paneTris` | a textured or flat quad through the internal flat program; `{ texture, uvs, color }` — `uvs` maps a sub-rectangle or tiles, never flips (§9) |

**HUD.** `beginHUD(gl)` saves the installed camera, installs an orthographic `P` over the
current viewport in y-down target pixels with identity `V`, and disables the depth test;
`endHUD(gl)` restores both. The screen-space gizmos and `image` are the usual contents.

---

## 11 · Internal programs — `programs.js`

The bridge exports no built-in program (apex pending decision #12, ruled): a hero binds its
own shaders, as the pseudo-host writes it, and the notebook's warm two-light convention
becomes a notebook helper on its local-lighting shader. What `programs.js` holds is
**internal** — compiled lazily per context, reachable only through the verbs that need
them:

- the flat colour / texture program behind `image`, `pane` and the pick pass (`uColor`,
  `uTexture`, `uUseTexture`, the declared transforms);
- the line pipe's program (`aPosition`, optional `aColor`, `uPV`, `uModel`, `uColor`);
- the pass-through vertex stage `program(frag)` attaches.

A hero that wants to pick a custom-shaded object passes its own id program to `pick`
(`opts.program`, §8); nothing else in the surface exposes these.

---

## 12 · Conventions

- `ndcZMin = WEBGL` (−1), `ndcYSign = +1` — constants, never detected; exported for the
  core calls a hero makes itself.
- The host's viewport is `[0, h, w, −h]` in logical canvas px (y-down, pointer space); the
  bridge's own is `gl.getParameter(gl.VIEWPORT)` in drawing-buffer px. `setCamera`
  converts nothing — the two live in their packages; `mapLocation` takes the host's.
- Texture orientation: GL's, bottom-up, settled at upload (§9).
- Depth: cleared by the application's `gl.clear`; disabled by `filter`, `image`, and HUD,
  restored after.
- Blend modes are named constants mapped to `blendFunc` pairs; `image` restores the prior
  state.
- Library code: semicolons, JSDoc, `@module webgl.tree/<file>`; examples without.
- Options object last; `gl` first; out-first and zero-alloc in every per-frame path.

---

## 13 · Seams

| seam | direction | contract |
|---|---|---|
| view bag | bridge → host | `setCamera(gl, cam, { host })` → `host.view.setCamera(cam)`; without a host, `viewOf(gl)` |
| gizmo arrays | tree → bridge | generators write into the bridge's cached arrays; the returned count sizes the draw |
| label anchors | tree → bridge → host | `out.labels` forwarded to `host.labels.set` under a gizmo-scoped id |
| uniforms bag | ui → bridge | a panel's `target` writes `u*` names; `bind(gl, prog, bag)` reads them |
| camera state | tree ↔ host ↔ bridge | plain data; the bridge only reads it |
| the twin | webgl.tree ↔ webgpu.tree | the same export list and signatures; `gl` becomes the device / context object; the differences table in `twin-design.md` |

---

## 14 · Gates

The bridge items of the apex's §6.3, owned here: the declared-transform upload against the
shadow hero; async readback latency; multi-target on twgl; line-pipe width. Plus three of its own:

- **Self-polling readback.** A raf poll inside the bridge, alive only while syncs are
  pending, must not double-drive a frame or leak when a context is lost. *Experiment:* a
  hover-driven pick every frame for a minute; count pending syncs.
- **The pick pass under custom programs.** A displaced surface (the displacement hero)
  needs its own id program; `opts.program` with `paint` setting `uColor` on it.
  *Experiment:* the displacement hero picked by id.
- **One orientation.** Uploading every image with `flipY` and never flipping again must
  reproduce the p5 orientation results in the portal and stereo heroes without a single
  `uvs` override. *Experiment:* `portal_projection` on `pane`.
