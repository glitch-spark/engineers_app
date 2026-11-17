// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';

const api = vi.hoisted(() => ({ lookupUsers: vi.fn() }));
vi.mock('../api/endpoints', async (orig) => ({ ...(await orig<object>()), ...api }));

import { firstTeamMember, teamMembersAZ, useFirstTeamMember } from './useFirstTeamMember';

describe('firstTeamMember', () => {
  it('sorts by name, case-insensitively, else email', () => {
    expect(firstTeamMember([
      { _id: 'z', name: 'zoe' },
      { _id: 'b', name: 'Bob' },
      { _id: 'a', name: null, email: 'carl@x.io' },
      { _id: 'c', name: 'alice' },
    ])).toBe('c');
    expect(teamMembersAZ([
      { _id: 'z', name: 'zoe' },
      { _id: 'b', name: 'Bob' },
      { _id: 'e', name: ' ', email: 'Ann@x.io' },
    ]).map((u) => u._id)).toEqual(['e', 'b', 'z']);
  });
  it('skips inactive users and admins', () => {
    expect(firstTeamMember([
      { _id: 'a', name: 'Aaron', isActive: false },
      { _id: 'b', name: 'Abe', role: 'admin' },
      { _id: 'c', name: 'Cleo', isActive: true },
      { _id: 'd', name: 'Dan' },
    ])).toBe('c');
  });
  it('breaks ties by id and is undefined without team members', () => {
    expect(firstTeamMember([{ _id: 'y', name: 'Sam' }, { _id: 'x', name: 'sam' }])).toBe('x');
    expect(firstTeamMember([])).toBeUndefined();
    expect(firstTeamMember(undefined)).toBeUndefined();
    expect(firstTeamMember([{ _id: 'a', name: 'A', isActive: false }])).toBeUndefined();
  });
});

describe('useFirstTeamMember', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
  );
  beforeEach(() => api.lookupUsers.mockReset());
  afterEach(cleanup);

  it('is loading, then the first team member, from the staff-only lookup', async () => {
    api.lookupUsers.mockResolvedValue({ users: [{ _id: 'b', name: 'Bea' }, { _id: 'a', name: 'al' }] });
    const { result } = renderHook(() => useFirstTeamMember(), { wrapper });
    expect(result.current).toEqual({ id: undefined, loading: true });
    await waitFor(() => expect(result.current).toEqual({ id: 'a', loading: false }));
    expect(api.lookupUsers).toHaveBeenCalledWith({ excludeRole: 'admin' });
  });
  it('is undefined, not loading, when there are no team members', async () => {
    api.lookupUsers.mockResolvedValue({ users: [] });
    const { result } = renderHook(() => useFirstTeamMember(), { wrapper });
    await waitFor(() => expect(api.lookupUsers).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.id).toBeUndefined();
  });
  it('asks for nothing when disabled (staff)', () => {
    const { result } = renderHook(() => useFirstTeamMember(false), { wrapper });
    expect(result.current).toEqual({ id: undefined, loading: false });
    expect(api.lookupUsers).not.toHaveBeenCalled();
  });
});
