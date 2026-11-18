// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import BidsTab from './BidsTab';
import CallersTab from './CallersTab';
import ResumeCompareTab from './ResumeCompareTab';

afterEach(cleanup);
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role: 'staff' } }) }));

const BACKWARDS = '/statistics?range=custom&from=2026-10-09&to=2026-10-01';
const IDLE = 'Pick a valid date range to see statistics.';

function show(tab: JSX.Element, url = BACKWARDS) {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <MemoryRouter initialEntries={[url]}>{tab}</MemoryRouter>
    </SWRConfig>,
  );
}

describe('statistics tabs with an invalid date range', () => {
  it.each([
    ['Bids and Interviews', <BidsTab key="b" />],
    ['Callers', <CallersTab key="c" />],
    ['Resume compare', <ResumeCompareTab key="r" />],
  ])('%s shows the idle message, not a spinner', (_name, tab) => {
    show(tab);
    expect(screen.getByText(IDLE)).toBeTruthy();
    expect(screen.queryByText(/Loading/)).toBeNull();
  });
});
