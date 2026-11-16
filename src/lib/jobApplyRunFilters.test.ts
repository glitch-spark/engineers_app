import { describe, expect, it } from 'vitest';
import { RUN_URL_DEFAULTS, clampRunPage, parseRunValues, shownRunTab } from './jobApplyRunFilters';

const parse = (over: Record<string, string> = {}) => parseRunValues({ ...RUN_URL_DEFAULTS, ...over });

describe('Job Applies runs filters', () => {
  it('defaults to the automatic tab, page 1, 20 per page', () => {
    expect(RUN_URL_DEFAULTS).toEqual({ status: '', page: '1', size: '20' });
    expect(parse()).toEqual({ status: '', page: 1, size: 20 });
  });
  it('reads good values', () => {
    expect(parse({ status: 'finished', page: '3', size: '50' })).toEqual({ status: 'finished', page: 3, size: 50 });
  });
  it('falls back to the defaults for junk', () => {
    expect(parse({ status: 'done', page: 'x', size: '25' })).toEqual({ status: '', page: 1, size: 20 });
    expect(parse({ page: '0' }).page).toBe(1);
    expect(parse({ page: '-2' }).page).toBe(1);
  });
  it('shows Needs you when something needs you, else All, unless a tab is chosen', () => {
    expect(shownRunTab(parse(), 2)).toBe('needs');
    expect(shownRunTab(parse(), 0)).toBe('all');
    expect(shownRunTab(parse({ status: 'progress' }), 2)).toBe('progress');
    expect(shownRunTab(parse({ status: 'all' }), 2)).toBe('all');
  });
  it('pulls a page past the end back to the last page', () => {
    expect(clampRunPage(5, 45, 20)).toBe(3);
    expect(clampRunPage(2, 45, 20)).toBe(2);
    expect(clampRunPage(4, 0, 20)).toBe(1);
  });
});
