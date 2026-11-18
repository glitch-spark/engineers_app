// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EarningsTab from './EarningsTab';

afterEach(cleanup);
let role = 'staff';
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock('../../lib/useFirstTeamMember', () => ({
  useTeamLookup: () => ({ data: { users: [{ _id: 'u1', name: 'Ann', email: 'a@x.io' }] } }),
}));
vi.mock('../dashboard/NetIncomeCard', () => ({ default: ({ userId }: { userId?: string }) => <div>net:{userId ?? 'self'}</div> }));
vi.mock('../dashboard/CompareCard', () => ({ default: ({ userId }: { userId?: string }) => <div>cmp:{userId ?? 'self'}</div> }));

describe('EarningsTab', () => {
  it('renders net income and you-vs-team', () => {
    role = 'staff';
    render(<MemoryRouter><EarningsTab /></MemoryRouter>);
    expect(screen.getByText('net:self')).toBeTruthy();
    expect(screen.getByText('cmp:self')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('admin select passes the chosen user to both cards', () => {
    role = 'admin';
    render(<MemoryRouter><EarningsTab /></MemoryRouter>);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'u1' } });
    expect(screen.getByText('net:u1')).toBeTruthy();
    expect(screen.getByText('cmp:u1')).toBeTruthy();
  });

  it('admin select starts from ?user=', () => {
    role = 'admin';
    render(<MemoryRouter initialEntries={['/?user=u1']}><EarningsTab /></MemoryRouter>);
    expect(screen.getByText('net:u1')).toBeTruthy();
  });
});
