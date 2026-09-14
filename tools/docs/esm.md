## ES modules

The ES build, `dist/index.js`, keeps twgl.js, `@nakednous/tree` and `@nakednous/host` external,
so each loads once beside the application's own imports. With a bundler, install all four:

```bash
npm install webgl.tree twgl.js @nakednous/tree @nakednous/host
```

Without one, an import map resolves the four names:

```html
<script type="importmap">
{ "imports": {
  "twgl.js": "https://cdn.jsdelivr.net/npm/twgl.js@7/dist/7.x/twgl-full.module.js",
  "webgl.tree": "https://cdn.jsdelivr.net/npm/webgl.tree/dist/index.js",
  "@nakednous/tree": "https://cdn.jsdelivr.net/npm/@nakednous/tree/dist/index.js",
  "@nakednous/host": "https://cdn.jsdelivr.net/npm/@nakednous/host/dist/index.js"
} }
</script>
```

The `tree` and `host` namespaces webgl.tree exports are `@nakednous/tree` and `@nakednous/host`;
importing either package directly gives the same module, and with it the lower-level functions the
API pages leave out. The demo below runs as a module script under that map.

<!-- caption: A camera state circling the axes, one turn every 6.3 seconds — as a module. -->
```js
import { setCamera, axes, tree } from 'webgl.tree'

const canvas = document.body.appendChild(document.createElement('canvas'))
canvas.width = 400
canvas.height = 300
const gl = canvas.getContext('webgl2')
const cam = tree.createCamera({ eye: [0, 107, 215] })

function frame(ms) {
  const t = ms / 1000
  cam.eye[0] = 215 * Math.sin(t)
  cam.eye[2] = 215 * Math.cos(t)
  gl.enable(gl.DEPTH_TEST)
  gl.clearColor(0.075, 0.553, 0.459, 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  setCamera(gl, cam)
  axes(gl, { size: 100 })
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```
