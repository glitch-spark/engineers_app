// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EarningsTab from './EarningsTab';

afterEach(cleanup);
let role = 'staff';
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock('../stats/FramedTab', () => ({ default: ({ tab }: { tab: string }) => <div>frame:{tab}</div> }));
vi.mock('../dashboard/NetIncomeCard', () => ({ default: ({ userId }: { userId?: string }) => <div>net:{userId ?? 'self'}</div> }));

describe('EarningsTab', () => {
  it('earnings tab renders frame + net income chart for the viewed person', () => {
    role = 'staff';
    render(<MemoryRouter initialEntries={['/?user=u1']}><EarningsTab /></MemoryRouter>);
    expect(screen.getByText('frame:earnings')).toBeTruthy();
    expect(screen.getByText('net:self')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('admin ?user= drives the chart', () => {
    role = 'admin';
    render(<MemoryRouter initialEntries={['/?user=u1']}><EarningsTab /></MemoryRouter>);
    expect(screen.getByText('net:u1')).toBeTruthy();
  });
});
