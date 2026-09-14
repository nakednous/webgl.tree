/**
 * @file Validator — the doclet table against the closed tag vocabulary.
 * @module tools/docs/validator
 * @license AGPL-3.0-only
 *
 * Errors fail the build; warnings print and continue.
 */

import { twglRefUrl, aliases, owners } from './config.js';

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
const GLOBAL_RE = /=\s*webglTree\b/;
const MODULE_RE = /^\s*(import|export)\b|\bimport\s*\(|\bawait\b/m;

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
 * The parameter names a function's source declares, in order: defaults
 * dropped, a rest parameter by its name, a destructured one as null (not
 * compared). Reads a declaration, a method or an arrow.
 * @param {string} src
 * @returns {Array<string|null>}
 */
export function paramNames(src) {
  const s = String(src).trimStart();
  const bare = /^(?:async\s+)?([\w$]+)\s*=>/.exec(s);
  if (bare) return [bare[1]];
  const out = [];
  let depth = 0, cur = '';
  for (let k = s.indexOf('(') + 1; k > 0 && k < s.length; k++) {
    const c = s[k];
    if (c === ')' && depth === 0) break;
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => {
    const name = p.trim().replace(/^\.\.\./, '');
    return /^[{[]/.test(name) ? null : name.split('=')[0].trim();
  });
}

/** A property descriptor anywhere up the prototype chain. */
function descriptorOf(obj, name) {
  for (let o = obj; o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, name);
    if (d) return d;
  }
  return null;
}

/**
 * An owner's members in the build, per `owners` in config: `has(name)` and
 * `params(name)`. Null when the owner is not configured or not in the build.
 */
function ownerScope(api, owner) {
  const path = owners[owner];
  if (!path) return null;
  const factory = path.endsWith('()');
  const target = (factory ? path.slice(0, -2) : path).split('.').reduce((o, k) => (o == null ? o : o[k]), api);
  if (target == null) return null;
  if (factory) {
    const src = String(target);
    const at = (name) => src.search(new RegExp(`[\\s,{](?:get\\s+)?${name}\\s*\\(`));
    return { has: (name) => at(name) >= 0, params: (name) => paramNames(src.slice(at(name) + 1).replace(/^get\s+/, '')) };
  }
  return {
    has:    (name) => descriptorOf(target, name) !== null,
    params: (name) => {
      const d = descriptorOf(target, name);
      return d && typeof d.value === 'function' ? paramNames(String(d.value)) : [];
    },
  };
}

/**
 * @param {{ modules, doclets, blocks }} parsed
 * @param {{ api?: object }} [ctx]  api: the evaluated IIFE build, for the re-exported surface.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validate(parsed, { api } = {}) {
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

  // Examples — every one is a complete classic script reading the webglTree global.
  for (const d of doclets) {
    d.examples.forEach((ex, i) => {
      if (MODULE_RE.test(ex.code)) fail(d, `@example #${i + 1} of ${d.name} uses module syntax — examples are classic scripts`);
      else if (!GLOBAL_RE.test(ex.code)) fail(d, `@example #${i + 1} of ${d.name} does not read the webglTree global`);
    });
    if (d.kind === 'function' && d.examples.length === 0) warn(d, `${d.owner}.${d.name} has no @example`);
  }

  // The re-exported surface — every documented name is in the build, and a
  // function's parameters are the ones its source declares.
  for (const d of doclets) {
    if (!d.reexport) continue;
    const scope = api ? ownerScope(api, d.owner) : null;
    if (!scope) { fail(d, `owner ${d.owner} of ${d.name} is not in the build`); continue; }
    if (!scope.has(d.name)) { fail(d, `${d.owner}.${d.name} is not in the build`); continue; }
    if (d.kind !== 'function') continue;
    const built = scope.params(d.name);
    const documented = d.params.map((p) => p.name);
    if (built.length !== documented.length || built.some((n, i) => n !== null && n !== documented[i])) {
      fail(d, `${d.owner}.${d.name}(${documented.join(', ')}) does not match the build's (${built.map((n) => n ?? '{…}').join(', ')})`);
    }
  }

  return { errors, warnings };
}
