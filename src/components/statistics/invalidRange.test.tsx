// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import ConversionTab from '../stats/ConversionTab';
import InterviewStatsTab from '../stats/InterviewStatsTab';
import ResumeCompareTab from './ResumeCompareTab';

const fetchSpy = vi.spyOn(globalThis, 'fetch');
afterEach(() => { cleanup(); fetchSpy.mockClear(); });
// the profile picker asks for accounts even on an invalid range: keep it off the network
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), listAccounts: () => Promise.resolve({ accounts: [], pagination: {} }) }));
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
    ['Conversion', <ConversionTab key="c" />],
    ['Interviews', <InterviewStatsTab key="i" />],
    ['Resume compare', <ResumeCompareTab key="r" />],
  ])('%s shows the idle message, not a spinner', (_name, tab) => {
    show(tab);
    expect(screen.getByText(IDLE)).toBeTruthy();
    expect(screen.queryByText(/Loading/)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled(); // no real request (it used to fail after teardown: flaky CI)
  });
});
