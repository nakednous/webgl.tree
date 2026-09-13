/**
 * The package surface: tree and host re-exported as namespaces.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as treePkg from '@nakednous/tree';
import * as hostPkg from '@nakednous/host';
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
