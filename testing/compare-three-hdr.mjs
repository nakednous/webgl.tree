// compare-three-hdr.mjs — decode the same .hdr with this bridge and with
// three.js, and report where the two disagree. Two decoders agreeing on a file
// neither wrote is what makes a decoder trustworthy; this is the harness.
//
//   node testing/compare-three-hdr.mjs <file.hdr> [path/to/three] [--float]
//
// three.js stores half-float by default, which quantizes its own output; --float
// asks it for full precision, so the two decoders can be compared exactly.

import { readFileSync } from 'node:fs';
import { decodeRGBE } from '../src/hdr.js';

const argv = process.argv.slice(2).filter((a) => a !== '--float');
const wantFloat = process.argv.includes('--float');
const file = argv[0];
const threeRoot = argv[1] || '/home/pierre/code/three.tree/node_modules/three';
if (!file) {
  console.error('usage: node testing/compare-three-hdr.mjs <file.hdr> [three root]');
  process.exit(2);
}

const { HDRLoader } = await import(threeRoot + '/examples/jsm/loaders/HDRLoader.js');
// three's FloatType (three/src/constants.js); half-float, its default, is 1016
const FLOAT_TYPE = 1015;
const buf = readFileSync(file);
const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const ours = decodeRGBE(bytes, { maxPixels: 64 * 1024 * 1024 });
const loader = new HDRLoader();
if (wantFloat) loader.setDataType(FLOAT_TYPE);
const theirs = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const half = (h) => {   // three's default is half-float: decode it back to float
  const s = (h >> 15) & 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return (s ? -1 : 1) * m * 2 ** -24;
  if (e === 31) return m ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * (1 + m / 1024) * 2 ** (e - 15);
};
const halfData = theirs.data;
const isHalf = halfData instanceof Uint16Array;

let maxAbs = 0, maxRel = 0, atAbs = -1, atRel = -1, n = 0, identical = 0;
let sumOurs = 0, sumTheirs = 0;
for (let i = 0; i < ours.data.length; i += 4) {
  for (let c = 0; c < 3; c++) {
    const a = ours.data[i + c];
    const b = isHalf ? half(halfData[i + c]) : halfData[i + c];
    n++; sumOurs += a; sumTheirs += b;
    const abs = Math.abs(a - b);
    if (abs === 0) identical++;
    const rel = abs / Math.max(Math.abs(a), Math.abs(b), 1e-30);
    if (abs > maxAbs) { maxAbs = abs; atAbs = i + c; }
    if (rel > maxRel) { maxRel = rel; atRel = i + c; }
  }
}
console.log(`${file}`);
console.log(`  ours   ${ours.width}x${ours.height} float32`);
console.log(`  three  ${theirs.width}x${theirs.height} ${isHalf ? 'half' : 'float'} (type ${theirs.type})`);
if (ours.width !== theirs.width || ours.height !== theirs.height) { console.error('  SIZE MISMATCH'); process.exit(1); }
console.log(`  channels ${n} · identical ${(100 * identical / n).toFixed(2)}%`);
console.log(`  mean ours ${(sumOurs / n).toExponential(6)} · three ${(sumTheirs / n).toExponential(6)} · ratio ${(sumOurs / sumTheirs).toFixed(6)}`);
console.log(`  max |Δ| ${maxAbs.toExponential(3)} (at ${atAbs}) · max rel ${(100 * maxRel).toFixed(4)}%`);
