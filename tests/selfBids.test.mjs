// Self bids from the extension on the Daily Plan (spec 2026-11-15-self-bids-extension-design.md). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formSelfBids, profileSelfLine } from '../src/lib/selfBids.ts';

test('pilot: tracked shows next to typed; after the switch: tracked + other applies', () => {
  assert.equal(profileSelfLine('a', { a: 39 }, []), 'Tracked 39 (extension)');
  assert.equal(profileSelfLine('b', { a: 39 }, []), null);
  assert.equal(profileSelfLine('a', { a: 39 }, ['a']), 'Tracked 39 by the extension + other applies typed here');
  assert.equal(profileSelfLine('a', {}, ['a']), 'Tracked 0 by the extension + other applies typed here');
});

test('the form holds "other applies" for tracked profiles, typed counts for the rest', () => {
  assert.deepEqual(formSelfBids({ a: 42, b: 5 }, ['a'], { a: 3 }), { a: 3, b: 5 });
  assert.deepEqual(formSelfBids({ a: 42, b: 5 }, [], {}), { a: 42, b: 5 });
  assert.deepEqual(formSelfBids({ a: 2 }, ['a'], {}), { a: 0 });
});
