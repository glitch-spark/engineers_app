// Profiles list helpers. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interviewsAppliedBy } from '../src/lib/profileList.ts';

test('interviews line leaves out "not set" when there are none', () => {
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 1, bidderAppliedInterviews: 0, unsetAppliedInterviews: 0 }),
    '1 self · 0 bidder');
  assert.equal(interviewsAppliedBy({}), '0 self · 0 bidder');
});

test('interviews line shows "not set" when some are', () => {
  assert.equal(interviewsAppliedBy({ selfAppliedInterviews: 1200, bidderAppliedInterviews: 2, unsetAppliedInterviews: 3 }),
    '1,200 self · 2 bidder · 3 not set');
});
