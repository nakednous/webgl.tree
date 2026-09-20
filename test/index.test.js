/**
 * The package surface: tree and host re-exported as namespaces.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as treePkg from '@nakednous/tree';
import * as hostPkg from '@nakednous/host';
import * as bridge from '../src/index.js';
import { tree, host, SCREEN } from '../src/index.js';

test('tree and host are the packages themselves', () => {
  assert.equal(tree.createCamera, treePkg.createCamera);
  assert.equal(tree.PoseTrack, treePkg.PoseTrack);
  assert.equal(host.createHost, hostPkg.createHost);
});

test('the namespaces keep clashing names apart', () => {
  assert.equal(SCREEN, null);
  assert.equal(tree.SCREEN, treePkg.SCREEN);
  assert.notEqual(tree.SCREEN, SCREEN);
});

test('the surface is the documented verbs: no internal helper is exported', () => {
  for (const name of ['contextOf', 'declaredTransforms', 'uploadTransforms', 'TRANSFORMS', 'disableMissingAttributes',
    'targetSpecs', 'rectMatrix', 'passOf', 'fill', 'expand', 'ndcZMin']) assert.equal(name in bridge, false, name);
  for (const name of ['releasePipe', 'fragCoord', 'pixelRatio', 'mat4Viewport']) assert.equal(typeof bridge[name], 'function', name);
});
