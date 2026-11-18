# tools/docs — the API site's build and its editor

`index.js` parses, validates and renders the doclets into `site/` (`npm run docs` at the repository
root). This folder is also a nested npm project of its own, because the site's editor is not the
repository's: it is `@nakednous/scholion`, installed here and nowhere else.

## The nested project

```
tools/docs/
  package.json        one dependency: @nakednous/scholion
  package-lock.json   committed — the root lock is ignored by pattern, this one is not
```

Until the package is published its dependency is a `file:` path, so the order matters:

```
cd ../scholion && npm run build     # the package's bundle, dist/editor.<hash>.js + dist/manifest.json
npm install --prefix tools/docs     # links the package into tools/docs/node_modules
npm run docs                        # copies the hashed asset into site/assets and stamps every page
```

The library's root `package.json` and lockfile are untouched: `npm run docs` reads the nested install
and nothing else. The workspace workflow that deploys the site installs the root and then the nested
project (`npm ci --prefix tools/docs`); with a `file:` dependency that step resolves only on a machine
that has the package checkout, which is why this project is not deployed yet — the first publish comes
first.

## What the build puts on a page

- `#docs-config`: a `<script type="application/json">` block holding `{ twgl, lib, imports, index,
  editor }`. The runner and the search script read it with `textContent` and `JSON.parse`; no page
  writes a global and no page holds code in an HTML attribute.
- `assets/editor.<hash>.js`: the package's bundle, copied under the name its manifest states. The build
  re-hashes the copy and refuses to write the site if it does not match the manifest's SHA-256, so a
  page can never carry a URL the artifact does not have.
- `assets/runner.js`, `assets/search.js`, `assets/chrome.js`: ES modules, deferred by the browser. The
  runner wires every figure's Run and Reset to the textarea, then imports the editor bundle — only on a
  page that has a `textarea.source` — mounts it, and marks a figure `data-editor="fallback"` if the
  import or the mount fails.
- The editor's look is split: the package ships the structure and the token-role mapping, this site
  states the values — `--cm-*` per role out of its own accent and neutral variables, and the type,
  leading and insets of its code fences. The probe measures every role's contrast against the editor's
  background in both themes; nothing about a palette lives in the package.
- `assets/editor.LICENSES.txt`: the bundled packages' notices, copied out of the release manifest and
  linked from every page's footer. The bundle carries no legal comments of its own, so this file is the
  notice a reader can reach.
- Every earlier `assets/editor.<hash>.js` is kept when the site is rebuilt: a page served from a cache
  still asks for the editor it was built against.

## The browser probe

```
node tools/docs/browser-check.mjs [--shots <dir>] [--json]
```

It serves `site/` (so `npm run docs` comes first) and drives headless Chromium over CDP with no
dependency. It checks the mount on every page, two editors on one page, Mod-Enter, undo and redo,
byte-exact Reset, an edit typed during a delayed import, an editor asset that 404s, the theme colours
in both themes and across a live switch, the longest sketch's last line, and that no editor wraps. It
needs `CHROME_BIN` or a chromium on `PATH`, and it is the gate for what the density check cannot see:
it reads presence, geometry and computed colour, never a pixel.
