// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const swr = vi.hoisted(() => ({ opts: undefined as undefined | { shouldRetryOnError: (e: unknown) => boolean; errorRetryCount: number } }));
vi.mock('swr', () => ({
  default: (_key: unknown, _fn: unknown, opts: typeof swr.opts) => {
    swr.opts = opts;
    return { data: undefined, error: undefined, mutate: vi.fn() };
  },
}));
vi.mock('../api/endpoints', () => ({ getBidClock: vi.fn() }));

import { ApiError } from '../api/client';
import { useReportClock } from './useReportClock';

describe('useReportClock retries', () => {
  it('does not retry a 404, retries other errors, and caps the count', () => {
    renderHook(() => useReportClock());
    const o = swr.opts!;
    expect(o.shouldRetryOnError(new ApiError(404, null))).toBe(false);
    expect(o.shouldRetryOnError(new ApiError(500, null))).toBe(true);
    expect(o.shouldRetryOnError(new Error('network'))).toBe(true);
    expect(o.errorRetryCount).toBe(3);
  });
});
