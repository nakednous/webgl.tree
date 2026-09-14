/**
 * @file Validator — the doclet table against the closed tag vocabulary.
 * @module tools/docs/validator
 * @license AGPL-3.0-only
 *
 * Errors fail the build; warnings print and continue.
 */

import { twglRefUrl, aliases } from './config.js';

const VOCABULARY = new Set([
  'file', 'module', 'license',
  'function', 'memberof',
  'param', 'returns',
  'constant',
  'typedef', 'property',
  'example',
  'details',
]);

const LINK_RE  = /\{@link\s+([^}\s]+)\s*\}/g;
const IMPORT_RE = /\bfrom\s+['"]webgl\.tree['"]/;

/** Split markdown into [text, fence, text, fence, …] so links inside fenced code are left alone. */
export function splitFences(md) {
  return md.split(/(```[\s\S]*?```)/g);
}

/** Every `{@link name}` target in a markdown string, fenced code excluded. */
function linkTargets(md) {
  const out = [];
  splitFences(md).forEach((seg, i) => {
    if (i % 2) return;
    for (const m of seg.matchAll(LINK_RE)) out.push(m[1]);
  });
  return out;
}

function* fields(rows) {
  for (const r of rows) { yield r; yield* fields(r.children); }
}

/** Every free-text field of a doclet that may carry `{@link}`. */
function* texts(d) {
  yield d.description;
  yield d.tagDescription;
  if (d.returns) yield d.returns.description;
  for (const f of fields(d.params))     yield f.description;
  for (const f of fields(d.properties)) yield f.description;
}

/**
 * Build the link table: `owner.name`, bare `name` (first wins), and module
 * names.
 * @returns {Map<string, Object>}
 */
export function linkTable({ modules, doclets }) {
  const table = new Map();
  for (const m of modules) table.set(m.name, { module: m });
  for (const d of doclets) table.set(`${d.owner}.${d.name}`, { doclet: d });
  for (const d of doclets) if (!table.has(d.name)) table.set(d.name, { doclet: d });
  for (const [cls, factory] of Object.entries(aliases)) {
    if (!table.has(cls) && table.has(factory)) table.set(cls, table.get(factory));
  }
  return table;
}

/**
 * @param {{ modules, doclets, blocks }} parsed
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validate(parsed) {
  const { modules, doclets, blocks } = parsed;
  const errors = [], warnings = [];
  const at   = (x) => `${x.file}:${x.line}`;
  const fail = (x, msg) => errors.push(`${at(x)}  ${msg}`);
  const warn = (x, msg) => warnings.push(`${at(x)}  ${msg}`);

  // Vocabulary — public blocks and module headers only; internal blocks are ignored.
  for (const b of blocks) {
    if (!b.public && !b.module) {
      if (b.tags.includes('memberof') || b.tags.includes('example')) {
        warn(b, 'internal block carries @memberof/@example but no @function/@constant/@typedef and no export — ignored');
      }
      continue;
    }
    for (const t of b.tags) {
      if (!VOCABULARY.has(t)) fail(b, `tag @${t} is outside the vocabulary`);
    }
  }

  // Module coverage — a file with public blocks needs a header.
  for (const d of doclets) {
    if (!d.module) fail(d, `no @module header in ${d.file}`);
  }

  // Names and owners.
  const seen = new Map();
  for (const d of doclets) {
    if (d.explicitName && d.exportName && d.explicitName !== d.exportName) {
      fail(d, `@function ${d.explicitName} contradicts export ${d.exportName}`);
    }
    if (d.via === 'function' && !blocks.find((b) => b.doclet === d).tags.includes('memberof')) {
      fail(d, `@function ${d.name} without @memberof`);
    }
    const key = `${d.owner}.${d.name}`;
    if (seen.has(key)) warn(d, `duplicate ${key} (first at ${seen.get(key)})`);
    else seen.set(key, at(d));
    for (const o of d.orphans) warn(d, `dotted @param ${o} has no parent parameter`);
  }

  // Links — a documented name, or a `twgl.`-prefixed name on twgl's reference.
  const table = linkTable(parsed);
  const resolves = (target) => table.has(target) || twglRefUrl(target) !== null;
  for (const d of doclets) {
    for (const t of texts(d)) {
      for (const target of linkTargets(t)) {
        if (!resolves(target)) fail(d, `unresolved {@link ${target}}`);
      }
    }
  }
  for (const m of modules) {
    for (const target of linkTargets(m.description)) {
      if (!resolves(target)) fail(m, `unresolved {@link ${target}}`);
    }
  }

  // Examples — every one is a complete module script importing webgl.tree.
  for (const d of doclets) {
    d.examples.forEach((ex, i) => {
      if (!IMPORT_RE.test(ex.code)) fail(d, `@example #${i + 1} of ${d.name} does not import from 'webgl.tree'`);
    });
    if (d.kind === 'function' && d.examples.length === 0) warn(d, `${d.owner}.${d.name} has no @example`);
  }

  return { errors, warnings };
}
