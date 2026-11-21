// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import Report from './Report';

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u', role: 'staff' } }) }));
vi.mock('../lib/useFirstTeamMember', () => ({ useTeamLookup: () => ({ data: undefined }) }));
vi.mock('../components/report/DayPanel', () => ({ default: ({ date }: { date: string }) => <div>panel {date}</div> }));
vi.mock('../api/endpoints', async (orig) => ({ ...(await orig<object>()),
  getWeekPlan: vi.fn(() => new Promise(() => {})),
  getDayPlans: vi.fn(() => new Promise(() => {})),
}));
afterEach(cleanup);

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
