/**
 * @file twgl.tree for script tags — the UMD entry.
 * @module twgl.tree/umd
 * @license AGPL-3.0-only
 *
 * @details
 * Everything twgl.tree exports, plus @nakednous/tree and @nakednous/host as
 * the `tree` and `host` namespaces, bundled into one file that reads twgl.js
 * from the global `twgl` and exposes the global `twglTree`.
 */

'use strict';

export * from './index.js';
export * as tree from '@nakednous/tree';
export * as host from '@nakednous/host';
