#!/usr/bin/env node
/**
 * @file Docs generator entry — `npm run docs`: src/*.js → site/.
 * @module tools/docs
 * @license AGPL-3.0-only
 *
 * Pipeline: parse doc blocks → validate (errors fail the build) → render →
 * write site/ alongside the IIFE and ES builds of the same commit, the static
 * chrome (assets/) and the editor bundle. Run `npm run build` first, and
 * `npm install --prefix tools/docs` once, which is where the editor comes from.
 */

import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { paths, site } from './config.js';
import { parseSources } from './parser.js';
import { validate } from './validator.js';
import { render } from './renderer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at   = (p) => join(root, p);

/**
 * The editor bundle the pages will load: the installed package's build, read
 * through its manifest — the asset name, its size and its SHA-256 — so a page
 * can never carry a URL the artifact does not have.
 * @returns {{ file: string, url: string, manifest: Object }}
 */
function editorAsset() {
  const manifestFile = at(paths.editorManifest);
  if (!existsSync(manifestFile)) {
    console.error(`[docs] ${paths.editor} is not installed — build the package's bundle, then ` +
                  '`npm install --prefix tools/docs`.');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const file = join(at(paths.editor), 'dist', manifest.asset);
  if (!existsSync(file)) {
    console.error(`[docs] ${manifest.asset} is missing from ${paths.editor}/dist — rebuild the package.`);
    process.exit(1);
  }
  const bytes = readFileSync(file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== manifest.sha256 || bytes.length !== manifest.bytes) {
    console.error(`[docs] ${manifest.asset} does not match its manifest — rebuild the package.`);
    process.exit(1);
  }
  return { file, url: `${site.editor}/${manifest.asset}`, manifest };
}

function main() {
  const pkg    = JSON.parse(readFileSync(at(paths.pkg), 'utf8'));
  const readme = readFileSync(at(paths.readme), 'utf8');
  const esm    = readFileSync(at(paths.esm), 'utf8');
  for (const build of [paths.bundle, paths.module]) {
    if (existsSync(at(build))) continue;
    console.error(`[docs] ${build} not found — run \`npm run build\` first.`);
    process.exit(1);
  }
  const editor = editorAsset();

  // The IIFE build, evaluated once: the validator checks the documented
  // tree / host surface against what it actually exports.
  const api = new Function('twgl', 'window', 'document',
    `${readFileSync(at(paths.bundle), 'utf8')}\n;return webglTree;`)({}, globalThis, undefined);

  // Parse + validate.
  const parsed = parseSources(at(paths.src), at(paths.docs));
  const { errors, warnings } = validate(parsed, { api, readme });
  for (const w of warnings) console.warn(`[docs] warn  ${w}`);
  for (const e of errors)   console.error(`[docs] error ${e}`);
  if (errors.length) {
    console.error(`[docs] ${errors.length} error(s) — site not written.`);
    process.exit(1);
  }

  // Render.
  const pages = render(parsed, { pkg, readme, esm, editor: editor.url });

  // Write site/ from scratch.
  const out = at(paths.site);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [file, html] of pages) writeFileSync(join(out, file), html);

  copyFileSync(at(paths.bundle), join(out, site.bundle));
  copyFileSync(at(paths.module), join(out, site.module));
  mkdirSync(join(out, site.editor), { recursive: true });
  copyFileSync(editor.file, join(out, site.editor, editor.manifest.asset));
  for (const [name, file] of Object.entries(paths.deps)) {
    if (!existsSync(at(file))) {
      console.error(`[docs] ${file} not found — ${name} is not installed.`);
      process.exit(1);
    }
    copyFileSync(at(file), join(out, site.deps[name]));
  }
  if (existsSync(at(paths.static))) cpSync(at(paths.static), out, { recursive: true });

  const examples = parsed.doclets.reduce((n, d) => n + d.examples.length, 0);
  console.log(`[docs] ${pages.size} page(s), ${parsed.doclets.length} doclet(s), ` +
              `${examples} example(s), ${warnings.length} warning(s) → ${paths.site}/`);
  console.log(`[docs] editor ${editor.url} ${(editor.manifest.bytes / 1024).toFixed(1)} kB ` +
              `(sha256 ${editor.manifest.sha256.slice(0, 16)}…)`);
}

main();
