// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import Report from './Report';

const auth = vi.hoisted(() => ({ role: 'staff' }));
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u', role: auth.role } }) }));
vi.mock('../lib/useFirstTeamMember', () => ({ useTeamLookup: () => ({ data: undefined }) }));
vi.mock('../components/report/SetupGrid', async () => {
  const { useState } = await import('react');
  return {
    default: function Grid({ week, onDirtyChange }: { week: string; onDirtyChange?: (d: boolean) => void }) {
      const [edited, setEdited] = useState(false);
      return (
        <div>
          <span>grid {week}{edited ? ' edited' : ''}</span>
          <button type="button" onClick={() => { setEdited(true); onDirtyChange?.(true); }}>edit</button>
        </div>
      );
    },
  };
});
vi.mock('../components/report/DayPanel', () => ({ default: ({ date }: { date: string }) => <div>panel {date}</div> }));
vi.mock('../api/endpoints', async (orig) => ({ ...(await orig<object>()),
  getWeekPlan: vi.fn(() => new Promise(() => {})),
  getDayPlans: vi.fn(() => new Promise(() => {})),
  getTeamReport: vi.fn(() => new Promise(() => {})),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  auth.role = 'staff';
});

const open = (url: string) =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <MemoryRouter initialEntries={[url]}><Report /></MemoryRouter>
    </SWRConfig>,
  );

describe('Report ?day=', () => {
  it('opens that day', () => {
    open('/plans?day=2026-11-17');
    expect(screen.getByText('panel 2026-11-17')).toBeTruthy();
  });
  it('ignores a malformed day', () => {
    open('/plans?day=nope');
    expect(screen.queryByText(/^panel/)).toBeNull();
  });
});

describe('Report view=setup', () => {
  it('an admin sees "Plan the week" on the team table and view=setup renders the grid; staff with view=setup get their own board', () => {
    auth.role = 'admin';
    open('/plans?week=2026-11-23');
    const link = screen.getByRole('link', { name: 'Plan the week' });
    expect(link.getAttribute('href')).toBe('/plans?week=2026-11-23&view=setup');
    cleanup();

    open('/plans?week=2026-11-23&view=setup');
    expect(screen.getByText('grid 2026-11-23')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Team' }).getAttribute('href')).toBe('/plans?week=2026-11-23');
    expect(screen.queryByRole('link', { name: 'Plan the week' })).toBeNull();
    cleanup();

    auth.role = 'staff';
    open('/plans?week=2026-11-23&view=setup');
    expect(screen.queryByText(/^grid/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Plan the week' })).toBeNull();
    expect(screen.getByRole('link', { name: 'My plan' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('Report setup grid with unpublished edits', () => {
  const LEAVE = 'Leave without publishing? Your changes to this week will be lost.';

  it('asks before stepping the week or going back to Team; Cancel keeps the week and the edit', () => {
    auth.role = 'admin';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open('/plans?week=2026-11-16&view=setup');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('grid 2026-11-09')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    for (const name of ['Previous week', 'Next week', 'This week']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(screen.getByText('grid 2026-11-09 edited')).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('link', { name: '← Team' }));
    expect(screen.getByText('grid 2026-11-09 edited')).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(confirm).toHaveBeenCalledWith(LEAVE);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('grid 2026-11-16')).toBeTruthy();
  });
});
