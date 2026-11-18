# tools/docs — the API site's declaration and its editor

`docs.config.js` is the site's declaration and `index.js` is `npm run docs`: the two of them state where
this site's sources are and hand them to `@nakednous/scholion/generator`, which parses, validates,
renders and writes `site/`. The pipeline is the package's — this folder holds no copy of a step. This
folder is also a nested npm project of its own, because the site's editor is not the repository's: it is
the same package, installed here and nowhere else.

## The nested project

```
tools/docs/
  docs.config.js      the declaration — paths, outputs, pins, references, the page's chrome
  index.js            ~8 lines: import the generator, hand it the declaration
  esm.md              the landing page's ES modules section, its one fence a live module demo
  static/             the stylesheet, the scripts, the favicons, the models — copied verbatim
  browser-check.mjs   the browser probe
  package.json        one dependency: @nakednous/scholion
  package-lock.json   committed — the root lock is ignored by pattern, this one is not
```

Until the package is published its dependency is a `file:` path, so the order matters:

```
cd ../../../scholion && npm run build   # the package's bundle, dist/editor.<hash>.js + dist/manifest.json
npm install --prefix tools/docs     # links the package into tools/docs/node_modules
npm run docs                        # copies the hashed asset into site/assets and writes every page
```

`scholion` is at `~/books/scholion` — the one package both instances' sites share. The library's root `package.json` and lockfile are untouched: `npm run docs` reads the nested install
and nothing else. The workspace workflow that deploys the site installs the root and then the nested
project (`npm ci --prefix tools/docs`); with a `file:` dependency that step resolves only on a machine
that has the package checkout, which is why this project is not deployed yet — the first publish comes
first.

## What the declaration says

`docs.config.js` carries the things only this site can know, and nothing it could compute:

- **the paths** — `src`, `docs` (the documentation-only carriers of the re-exported tree / host
  surface), the IIFE and ES builds of the same commit, the dependency builds the ES build was made
  against, `static/`, and `site/`;
- **the outputs** — the names the page finds them under, the search index, the editor's directory and
  its notices file;
- **the pins** — twgl.js's version and the two artifacts a page names, one version and no `latest`;
- **the references** — each package's address, and twgl's documentation grammar: its base and a URL
  template per name shape, so `twgl.m4.perspective` resolves without a function in this folder;
- **the surface** — the IIFE leaves `webglTree`, twgl.js is stubbed when it is evaluated, and `owners`
  says where each documented owner lives in it;
- **the rules** — `src/index.js`'s re-exports are public, an `@ignore` block is not, an example is a
  classic script reading `webglTree`;
- **the page** — `mode: 'esm'`, the stylesheet and the favicons, and the runner's config block with
  its `{pin:…}` and `{index}` tokens.

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
