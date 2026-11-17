// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SWRConfig } from 'swr';
import InterviewsPage from './InterviewsPage';

const mocks = vi.hoisted(() => ({
  listCallerRounds: vi.fn(),
  getInterview: vi.fn(),
  listCallers: vi.fn(),
  assignRoundCaller: vi.fn(),
}));

vi.mock('../../api/endpoints', async () => ({
  ...(await vi.importActual<typeof import('../../api/endpoints')>('../../api/endpoints')),
  listCallerRounds: mocks.listCallerRounds,
  getInterview: mocks.getInterview,
  listCallers: mocks.listCallers,
  assignRoundCaller: mocks.assignRoundCaller,
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', role: 'staff' } }),
}));

beforeEach(() => {
  mocks.listCallers.mockResolvedValue({ callers: [], canManage: false });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Where({ name }: { name: string }) {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${name} ${pathname}${search}`}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/interviews" element={<InterviewsPage view="list" />} />
        <Route path="/interviews/calendar" element={<InterviewsPage view="calendar" />} />
        <Route path="/interviews/callers" element={<Where name="callers-list" />} />
        <Route path="/interviews/callers/calendar" element={<Where name="callers-calendar" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InterviewsPage old ?call= links', () => {
  it('redirects /interviews?call=caller to Caller interviews, keeping the other keys', () => {
    renderAt('/interviews?call=caller&q=acme&range=next_week');
    expect(screen.getByTestId('where').textContent).toBe('callers-list /interviews/callers?q=acme&range=next_week');
  });

  it('redirects the calendar variant to the Caller interviews calendar', () => {
    renderAt('/interviews/calendar?stage=intro&call=caller');
    expect(screen.getByTestId('where').textContent).toBe('callers-calendar /interviews/callers/calendar?stage=intro');
  });
});

describe('InterviewsPage caller rounds open in the pane', () => {
  const round = {
    id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z',
    caller: { enabled: true, callerId: null, callerName: 'TBD', method: 'video' },
  };
  const interview = {
    _id: 'iv1', accountId: 'a1', createdBy: 'me', scheduledAt: round.scheduledAt, companyName: 'Acme Corp',
    stageHistory: [{ id: 'r0', stage: 'intro', status: 'passed', scheduledAt: '2029-12-01T10:00:00Z' }, round],
  };

  function renderCallers(url: string) {
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/interviews/callers" element={<InterviewsPage view="list" callers />} />
          </Routes>
        </MemoryRouter>
      </SWRConfig>,
    );
  }

  it('a caller round click opens the interview pane on that round', async () => {
    mocks.listCallerRounds.mockResolvedValue({
      rounds: [{
        interviewId: 'iv1', roundId: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: round.scheduledAt, endsAt: null,
        companyName: 'Acme Corp', profileLabel: null, ownerId: 'me', ownerName: 'Me', hasCaller: true, callerId: null, callerName: 'TBD',
      }],
      interviews: { iv1: interview },
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    });
    renderCallers('/interviews/callers');
    const cell = (await screen.findAllByText('Acme Corp'))[0];
    fireEvent.click(cell);
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    expect(within(pane).getByRole('button', { name: 'Add next round' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /Acme Corp · / })).toBeNull();
    const focused = pane.querySelector('li[data-focused="true"]');
    expect(focused?.textContent).toContain('Tech round 1');
    expect(pane.querySelectorAll('li[data-focused="true"]')).toHaveLength(1);
  });

  it('?round=iv1:r1 opens the pane on that round', async () => {
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(interview);
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    expect(mocks.getInterview).toHaveBeenCalledWith('iv1');
    expect(pane.querySelector('li[data-focused="true"]')?.textContent).toContain('Tech round 1');
  });

  it('an unknown round in ?round= opens the pane without a highlight', async () => {
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(interview);
    renderCallers('/interviews/callers?round=iv1:nope');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    expect(pane.querySelector('[data-focused="true"]')).toBeNull();
  });

  it('a manager can assign the caller on another owner interview, which stays view-only', async () => {
    mocks.listCallers.mockResolvedValue({ callers: [{ _id: 'ana1', kind: 'user', name: 'Ana', color: 'sky', archived: false }], canManage: true });
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue({ ...interview, createdBy: { _id: 'other', name: 'Other' }, summaryOnly: true });
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    await waitFor(() => expect(within(pane).getByRole('button', { name: 'Assign caller' })).toBeTruthy());
    expect(within(pane).queryByRole('button', { name: 'Add next round' })).toBeNull();
    expect(within(pane).getByText(/View only/)).toBeTruthy();
  });

  it('a manager save on another owner interview keeps the pane view-only', async () => {
    const other = { ...interview, createdBy: { _id: 'other', name: 'Other' } };
    mocks.listCallers.mockResolvedValue({ callers: [{ _id: 'ana1', kind: 'user', name: 'Ana', color: 'sky', archived: false }], canManage: true });
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue({ ...other, summaryOnly: true });
    // The endpoint returns the full interview, with no summaryOnly flag.
    mocks.assignRoundCaller.mockResolvedValue({
      ...other,
      stageHistory: [other.stageHistory[0], { ...round, caller: { enabled: true, callerId: 'ana1', callerName: 'Ana', callerKind: 'user', method: 'video' } }],
    });
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    const assign = await within(pane).findAllByRole('button', { name: 'Assign caller' });
    fireEvent.click(assign[0]);
    fireEvent.change(within(pane).getByLabelText('Caller for Tech round 1'), { target: { value: 'ana1' } });
    await waitFor(() => expect(mocks.assignRoundCaller).toHaveBeenCalledWith('iv1', 'r1', 'ana1'));
    await waitFor(() => expect(within(pane).getAllByText('Ana').length).toBeGreaterThan(0));
    expect(within(pane).queryByRole('region', { name: 'Details' })).toBeNull();
    expect(within(pane).getByText(/View only/)).toBeTruthy();
  });

  it('Escape in the open caller picker closes only the picker, then Escape closes the pane', async () => {
    mocks.listCallers.mockResolvedValue({ callers: [{ _id: 'ana1', kind: 'user', name: 'Ana', color: 'sky', archived: false }], canManage: true });
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(interview);
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    const assign = await within(pane).findAllByRole('button', { name: 'Assign caller' });
    fireEvent.click(assign[0]);
    fireEvent.keyDown(within(pane).getByLabelText('Caller for Tech round 1'), { key: 'Escape' });
    expect(within(pane).queryByLabelText('Caller for Tech round 1')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Acme Corp' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Acme Corp' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Acme Corp' })).toBeNull());
  });
});
