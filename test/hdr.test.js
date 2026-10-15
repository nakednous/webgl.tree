/**
 * @file hdr.test.js — loadHDR, the one part of the Radiance work the bridge
 * owns: the fetch, and the GL row order a texture needs. The decoder and the
 * encoder live in @nakednous/host and are re-exported, tested there.
 * @license AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeRGBE, encodeRGBE, loadHDR } from '../src/hdr.js';

test('hdr: the bridge re-exports the decoder and the encoder it is built on', () => {
  assert.equal(typeof decodeRGBE, 'function', 'the decoder reaches an application through the bridge');
  assert.equal(typeof encodeRGBE, 'function', 'and so does its inverse');
});

// ── the two-byte fixtures this file needs ─────────────────────────────────

const text = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

// A whole file: header + resolution + the scanline bytes, as given. The header
// ends at the resolution line — the first scanline starts at the next byte.
function file(res, bytes) {
  const head = text(['#?RADIANCE', 'FORMAT=32-bit_rle_rgbe', '', res].map((l) => l + '\n').join(''));
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head); out.set(bytes, head.length);
  return out;
}

// One flat scanline: four bytes per pixel, no runs.
function flat(pixels) {
  const out = new Uint8Array(pixels.length * 4);
  pixels.forEach((p, i) => out.set(p, i * 4));
  return out;
}

test('hdr: loadHDR hands back GL\'s row order, so a file goes up upright', async () => {
  // two rows, the first bright and the second black. The file states -Y, so row
  // 0 is the top of the picture; GL's space has row 0 at v = 0, the bottom, so
  // uploading file order would hang the picture upside down.
  const bytes = file('-Y 2 +X 1', flat([[200, 200, 200, 136], [0, 0, 0, 0]]));
  const asFile = decodeRGBE(bytes)
  const asGl = await loadHDR('data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64'))
  assert.equal(asFile.data[0], 200, 'decodeRGBE keeps the file\'s own order')
  assert.equal(asGl.data[0], 0, 'loadHDR turns them over: the dark row is now row 0')
  assert.equal(asGl.data[4], 200, 'and the bright row is at the top of the texture')
  assert.deepEqual([...asGl.data], [...decodeRGBE(bytes, { rowOrder: 'BOTTOM_UP' }).data])
})
