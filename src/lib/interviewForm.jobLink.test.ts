import { describe, expect, it } from 'vitest';
import { lacksJobLink } from './interviewForm';

describe('lacksJobLink (the interview can be tied to a bid only through a job link or a resume)', () => {
  it('flags no job link and no resume picked', () => {
    expect(lacksJobLink('', { mode: 'search' }, false)).toBe(true);
    expect(lacksJobLink('   ', { mode: 'keep' }, false)).toBe(true);
  });

  it('is fine with a job link, a picked resume, or a kept saved link', () => {
    expect(lacksJobLink('https://jobs.ashbyhq.com/acme/1', { mode: 'search' }, false)).toBe(false);
    expect(lacksJobLink('', { mode: 'match', matchId: 'r1' }, false)).toBe(false);
    expect(lacksJobLink('', { mode: 'keep' }, true)).toBe(false);
  });

  it('is fine when the user said why there is no resume (no bid exists)', () => {
    expect(lacksJobLink('', { mode: 'none', reason: 'recruiter', note: '' }, false)).toBe(false);
    expect(lacksJobLink('', { mode: 'none', reason: '', note: '' }, false)).toBe(true);
  });
});
