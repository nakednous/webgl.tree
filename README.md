# `twgl.tree`

`@nakednous/tree` and `@nakednous/host` on raw WebGL2 through [twgl](https://twgljs.org/): a
line pipe that draws the core's gizmo arrays, HUD mode, render targets in every shape (sized,
depth-only, multi-target), fullscreen filter passes and the ping-pong pipe, asynchronous
colour-ID scene picking, and a camera install that uploads only the transforms a program
declares. No engine, no scene graph — twgl's own verbs stay yours.

> **Status: design.** The bridge surface is being settled in `bridge-design.md`; no source has
> been written. This README is a placeholder that states the package's place in the stack.

---

## Architecture

`twgl.tree` is the bridge layer of an engine-free stack — the one place that touches the GPU
API. Its WebGPU twin, `webgpu.tree`, realizes the same surface through webgpu-utils.

```
  application  (imports twgl itself — createProgramInfo, createBufferInfoFromArrays, …)
      │
      ▼
  twgl.tree                   ← this package: the GPU, thinly
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility
      │
      └── twgl                ← peer dependency
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host } ← twgl.tree`; nothing flows back.

---

## License

AGPL-3.0-only  
© JP Charalambos
