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
  updateInterviewStage: vi.fn(),
  lookupUsers: vi.fn(),
  lookupAccounts: vi.fn(),
  listInterviews: vi.fn(),
  getNeedsInput: vi.fn(),
  role: 'staff',
}));

vi.mock('../../api/endpoints', async () => ({
  ...(await vi.importActual<typeof import('../../api/endpoints')>('../../api/endpoints')),
  listCallerRounds: mocks.listCallerRounds,
  getInterview: mocks.getInterview,
  listCallers: mocks.listCallers,
  assignRoundCaller: mocks.assignRoundCaller,
  updateInterviewStage: mocks.updateInterviewStage,
  lookupUsers: mocks.lookupUsers,
  lookupAccounts: mocks.lookupAccounts,
  listInterviews: mocks.listInterviews,
  getNeedsInput: mocks.getNeedsInput,
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', role: mocks.role } }),
}));

beforeEach(() => {
  mocks.role = 'staff';
  mocks.listCallers.mockResolvedValue({ callers: [], canManage: false });
  mocks.lookupUsers.mockResolvedValue({ users: [] });
  mocks.lookupAccounts.mockResolvedValue({ accounts: [] });
  mocks.listInterviews.mockResolvedValue({ interviews: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false } });
  mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 0 } });
  mocks.getNeedsInput.mockResolvedValue({ items: [], counts: { result: 0, reason: 0 } });
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

describe("Self interviews: an admin's User default is the first team member A–Z", () => {
  function Search() {
    return <p data-testid="search">{useLocation().search}</p>;
  }
  function renderSelf(url: string) {
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/interviews" element={<><InterviewsPage view="list" /><Search /></>} />
            <Route path="/interviews/callers" element={<><InterviewsPage view="list" callers /><Search /></>} />
          </Routes>
        </MemoryRouter>
      </SWRConfig>,
    );
  }
  const creators = () => mocks.listInterviews.mock.calls.map(([q]) => q.creatorId);

  beforeEach(() => {
    mocks.role = 'admin';
    mocks.lookupUsers.mockResolvedValue({ users: [{ _id: 't2', name: 'Zoe' }, { _id: 't1', name: 'ben' }, { _id: 't0', name: 'Al', isActive: false }] });
  });

  it("asks for the first team member's interviews only, never everyone's first", async () => {
    renderSelf('/interviews');
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect(creators().every((c) => c === 't1')).toBe(true);
    await waitFor(() => expect((screen.getByLabelText('User') as HTMLSelectElement).selectedOptions[0]?.text).toBe('ben'));
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it('an explicit All users survives a reload, and Clear goes back to the default', async () => {
    renderSelf('/interviews?user=all');
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect(creators().every((c) => c === undefined)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''));
    await waitFor(() => expect(creators().at(-1)).toBe('t1'));
  });

  it('Caller interviews keeps every user by default', async () => {
    renderSelf('/interviews/callers');
    await waitFor(() => expect(mocks.listCallerRounds).toHaveBeenCalled());
    expect(mocks.listCallerRounds.mock.calls.every(([q]) => q.creatorId === undefined)).toBe(true);
  });

  it('staff still open on their own interviews', async () => {
    mocks.role = 'staff';
    renderSelf('/interviews');
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect(creators().every((c) => c === 'me')).toBe(true);
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

  it('a manager sets a round status and changes its time on another owner interview, sending only those fields', async () => {
    mocks.role = 'interview_manager';
    const other = { ...interview, createdBy: { _id: 'other', name: 'Other' } };
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(other);
    mocks.updateInterviewStage.mockResolvedValue(other);
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    expect(within(pane).getByLabelText('Status of Tech round 1')).toBeTruthy();
    expect(within(pane).queryByRole('button', { name: 'Add next round' })).toBeNull();
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for Tech round 1 round' }));
    expect(screen.queryByRole('menuitem', { name: 'Edit round' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change time' }));
    const dialog = await screen.findByRole('dialog', { name: /Change time/ });
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2030-01-02' } });
    fireEvent.change(within(dialog).getByLabelText(/Why was it rescheduled\?/), { target: { value: 'fix' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledTimes(1));
    const [id, roundId, body] = mocks.updateInterviewStage.mock.calls[0];
    expect([id, roundId, Object.keys(body)]).toEqual(['iv1', 'r1', ['scheduledAt']]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Change time/ })).toBeNull());

    fireEvent.change(within(pane).getByLabelText('Status of Tech round 1'), { target: { value: 'completed' } });
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledTimes(2));
    expect(mocks.updateInterviewStage.mock.calls[1]).toEqual(['iv1', 'r1', { status: 'completed' }]);
  });

  it('a staff member on another owner interview gets no status select or Change time', async () => {
    const other = { ...interview, createdBy: { _id: 'other', name: 'Other' } };
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(other);
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    expect(within(pane).queryByLabelText('Status of Tech round 1')).toBeNull();
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for Tech round 1 round' }));
    expect(screen.queryByRole('menuitem', { name: 'Change time' })).toBeNull();
  });

  it('Escape in the Change time dialog closes only the dialog, then Escape closes the pane', async () => {
    mocks.role = 'interview_manager';
    const other = { ...interview, createdBy: { _id: 'other', name: 'Other' } };
    mocks.listCallerRounds.mockResolvedValue({ rounds: [], interviews: {}, pagination: { page: 1, limit: 25, total: 0, pages: 1 } });
    mocks.getInterview.mockResolvedValue(other);
    renderCallers('/interviews/callers?round=iv1:r1');
    const pane = await screen.findByRole('dialog', { name: 'Acme Corp' });
    fireEvent.click(within(pane).getByRole('button', { name: 'Actions for Tech round 1 round' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Change time' }));
    const dialog = await screen.findByRole('dialog', { name: /Change time/ });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Change time/ })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Acme Corp' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Acme Corp' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Acme Corp' })).toBeNull());
  });
});

describe('Interviews page: Needs your input', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    interviewId: 'iv1', roundId: 'r1', companyName: 'Acme Corp', profileName: 'John D', ownerId: 'me', ownerName: 'Maya Owner',
    stage: 'tech1', status: 'completed', scheduledAt: '2026-11-10T15:00:00Z', need: 'result', ...over,
  });
  const reasonItem = item({ interviewId: 'iv2', roundId: 'r2', companyName: 'Globex', status: 'canceled', need: 'reason' });
  const feed = (items: unknown[]) => ({
    items,
    counts: {
      result: items.filter((i) => (i as { need: string }).need === 'result').length,
      reason: items.filter((i) => (i as { need: string }).need === 'reason').length,
    },
  });

  function renderPage(url = '/interviews') {
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/interviews" element={<InterviewsPage view="list" />} />
            <Route path="/interviews/callers" element={<InterviewsPage view="list" callers />} />
          </Routes>
        </MemoryRouter>
      </SWRConfig>,
    );
  }
  const section = () => screen.findByRole('region', { name: /Needs your input/ });

  it('is hidden when nothing needs input', async () => {
    renderPage();
    await waitFor(() => expect(mocks.getNeedsInput).toHaveBeenCalled());
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect(screen.queryByText(/Needs your input/)).toBeNull();
  });

  it('shows the count and one row per round, with what is missing', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([item(), reasonItem]));
    renderPage();
    const box = await section();
    expect(within(box).getByRole('heading', { name: 'Needs your input (2)' })).toBeTruthy();
    const rows = within(box).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Acme Corp');
    expect(rows[0].textContent).toContain('John D');
    expect(rows[0].textContent).toContain('Tech round 1');
    expect(rows[0].textContent).toContain('Nov 10');
    expect(within(rows[0]).getByText('No result yet')).toBeTruthy();
    expect(within(rows[0]).getByRole('button', { name: 'Passed' })).toBeTruthy();
    expect(within(rows[1]).getByText('Canceled, no reason')).toBeTruthy();
    expect(within(rows[1]).queryByRole('button', { name: 'Passed' })).toBeNull();
    // A normal user gets their own: no user is asked for, and the owner is not repeated on each row.
    expect(mocks.getNeedsInput).toHaveBeenCalledWith(undefined);
    expect(within(box).queryByText('Maya Owner')).toBeNull();
  });

  it('a result row saved as Rejected asks the reason, then leaves the list', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([item()]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    const box = await section();
    fireEvent.click(within(box).getByRole('button', { name: 'Rejected' }));
    const dialog = await screen.findByRole('dialog', { name: /Reject round · Acme Corp · Tech round 1/ });
    const save = within(dialog).getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(mocks.updateInterviewStage).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'no_answer' } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'rejected', statusNote: '', statusReason: 'no_answer' },
    ));
    await waitFor(() => expect(screen.queryByText(/Needs your input/)).toBeNull());
  });

  it('a result row saved as Passed needs no reason', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([item()]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Passed' }));
    const dialog = await screen.findByRole('dialog', { name: /Passed to next round · Acme Corp/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Passed' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv1', 'r1', { status: 'passed', statusNote: '' }));
  });

  it('a reason row opens the reason dialog and sends only the reason, keeping the round status and note', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([reasonItem]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Add reason' }));
    const dialog = await screen.findByRole('dialog', { name: /Globex · Tech round 1/ });
    fireEvent.change(within(dialog).getByLabelText(/Why was it canceled\?/), { target: { value: 'company' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Canceled' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv2', 'r2', { statusReason: 'company' }));
    await waitFor(() => expect(screen.queryByText(/Needs your input/)).toBeNull());
  });

  it('backing out of the dialog saves nothing and keeps the row', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([item()]));
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Rejected' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: /Reject round/ })).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Reject round/ })).toBeNull());
    expect(mocks.updateInterviewStage).not.toHaveBeenCalled();
    expect(within(await section()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('an admin sees the owner on each row, for the user picked in the filter', async () => {
    mocks.role = 'admin';
    mocks.lookupUsers.mockResolvedValue({ users: [{ _id: 't1', name: 'ben' }] });
    mocks.getNeedsInput.mockResolvedValue(feed([item()]));
    renderPage();
    const box = await section();
    expect(within(box).getByText('Maya Owner')).toBeTruthy();
    expect(mocks.getNeedsInput.mock.calls.every(([u]) => u === 't1')).toBe(true);
  });

  it("an admin on All users asks for everyone's", async () => {
    mocks.role = 'admin';
    mocks.getNeedsInput.mockResolvedValue(feed([item()]));
    renderPage('/interviews?user=all');
    await section();
    expect(mocks.getNeedsInput.mock.calls.every(([u]) => u === undefined)).toBe(true);
  });

  it('is not shown on Caller interviews', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([item()]));
    renderPage('/interviews/callers');
    await waitFor(() => expect(mocks.listCallerRounds).toHaveBeenCalled());
    expect(screen.queryByText(/Needs your input/)).toBeNull();
    expect(mocks.getNeedsInput).not.toHaveBeenCalled();
  });
});
