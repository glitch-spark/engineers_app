import { describe, expect, it } from 'vitest';
import { aiUsageRange, bucketLabel } from './aiUsagePeriod';

describe('aiUsageRange', () => {
  it('is local midnight of from up to local midnight after to (to exclusive)', () => {
    expect(aiUsageRange({ from: '2026-11-14', to: '2026-11-14' })).toEqual({
      from: new Date(2026, 10, 14).toISOString(),
      to: new Date(2026, 10, 15).toISOString(),
    });
    expect(aiUsageRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({
      from: new Date(2026, 10, 1).toISOString(),
      to: new Date(2026, 11, 1).toISOString(),
    });
  });

  it('rolls over a year end', () => {
    expect(aiUsageRange({ from: '2026-12-31', to: '2026-12-31' }).to).toBe(new Date(2027, 0, 1).toISOString());
  });
});

describe('bucketLabel', () => {
  it('labels hours and days', () => {
    expect(bucketLabel('2026-11-14T13:00')).toBe('13:00');
    expect(bucketLabel('2026-11-14')).toBe('Nov 14');
  });
});
