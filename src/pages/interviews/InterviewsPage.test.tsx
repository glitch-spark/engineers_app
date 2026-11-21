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
  followUpInterviewStage: vi.fn(),
  getInterviewSummary: vi.fn(),
  listInterviewRounds: vi.fn(),
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
  followUpInterviewStage: mocks.followUpInterviewStage,
  getInterviewSummary: mocks.getInterviewSummary,
  listInterviewRounds: mocks.listInterviewRounds,
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
  mocks.getNeedsInput.mockResolvedValue({ items: [], counts: { outcome: 0, follow_up: 0, heard_back: 0, reason: 0 } });
  mocks.getInterviewSummary.mockResolvedValue({ total: 0, byStatus: { scheduled: 0, completed: 0, passed: 0, rejected: 0, canceled: 0 } });
  mocks.listInterviewRounds.mockResolvedValue({ rounds: [], interviews: {} });
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
  const DAY = 86400000;
  const item = (over: Record<string, unknown> = {}) => ({
    interviewId: 'iv1', roundId: 'r1', companyName: 'Acme Corp', profileName: 'John D', ownerId: 'me', ownerName: 'Maya Owner',
    stage: 'tech1', status: 'scheduled', scheduledAt: '2026-11-10T15:00:00Z', need: 'outcome', ...over,
  });
  const followUpItem = item({
    interviewId: 'iv2', roundId: 'r2', companyName: 'Globex', status: 'completed', need: 'follow_up',
    scheduledAt: new Date(Date.now() - 9 * DAY - 3600000).toISOString(),
  });
  const heardBackItem = item({
    interviewId: 'iv3', roundId: 'r3', companyName: 'Initech', status: 'completed', need: 'heard_back',
    scheduledAt: '2026-10-20T15:00:00Z', followedUpAt: '2026-11-06T12:00:00Z',
  });
  const reasonItem = item({ interviewId: 'iv4', roundId: 'r4', companyName: 'Umbrella', status: 'canceled', need: 'reason' });
  const feed = (items: unknown[]) => ({
    items,
    counts: Object.fromEntries(['outcome', 'follow_up', 'heard_back', 'reason'].map(
      (need) => [need, items.filter((i) => (i as { need: string }).need === need).length],
    )),
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
  const buttons = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => b.textContent);
  const gone = () => waitFor(() => expect(screen.queryByText(/Needs your input/)).toBeNull());

  it('is hidden when nothing needs input', async () => {
    renderPage();
    await waitFor(() => expect(mocks.getNeedsInput).toHaveBeenCalled());
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect(screen.queryByText(/Needs your input/)).toBeNull();
  });

  it('shows the total count and the four groups in order, each with its row text and buttons', async () => {
    // Fed out of order: the headings follow the steps, not the feed.
    mocks.getNeedsInput.mockResolvedValue(feed([reasonItem, heardBackItem, followUpItem, item()]));
    renderPage();
    const box = await section();
    expect(within(box).getByRole('heading', { name: 'Needs your input (4)' })).toBeTruthy();
    expect(within(box).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'How did it go?', 'Follow up with the company', 'Did you hear back?', 'Add the reason',
    ]);
    const rows = within(box).getAllByRole('listitem');
    expect(rows).toHaveLength(4);

    for (const text of ['Acme Corp', 'John D', 'Tech round 1']) expect(rows[0].textContent).toContain(text);
    expect(buttons(rows[0])).toEqual(['Completed', 'Passed', 'Rejected', 'Rescheduled', 'Canceled']);

    expect(rows[1].textContent).toContain('Globex');
    expect(within(rows[1]).getByText('No result for 9 days')).toBeTruthy();
    expect(buttons(rows[1])).toEqual(['I followed up', 'Passed', 'Rejected']);

    expect(rows[2].textContent).toContain('Initech');
    expect(within(rows[2]).getByText('Followed up on Nov 6, no result yet')).toBeTruthy();
    expect(buttons(rows[2])).toEqual(['No, close as rejected', 'Passed', 'Rejected']);

    expect(rows[3].textContent).toContain('Umbrella');
    expect(within(rows[3]).getByText('Canceled, no reason')).toBeTruthy();
    expect(buttons(rows[3])).toEqual(['Add reason']);

    // A normal user gets their own: no user is asked for, and the owner is not repeated on each row.
    expect(mocks.getNeedsInput).toHaveBeenCalledWith(undefined);
    expect(within(box).queryByText('Maya Owner')).toBeNull();
  });

  it('a group with no rows shows no heading', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([followUpItem, reasonItem]));
    renderPage();
    const box = await section();
    expect(within(box).getByRole('heading', { name: 'Needs your input (2)' })).toBeTruthy();
    expect(within(box).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Follow up with the company', 'Add the reason',
    ]);
  });

  it('a "How did it go?" row says when the round ended, or when it started if the end is not known', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([
      item({ endsAt: '2026-11-10T16:00:00Z' }), item({ interviewId: 'iv9', roundId: 'r9' }),
    ]));
    renderPage();
    const rows = within(await section()).getAllByRole('listitem');
    expect(rows[0].textContent).toMatch(/ended \w+, Nov 10/);
    expect(rows[1].textContent).toMatch(/started \w+, Nov 10/);
  });

  it('Completed saves the status at once and the row leaves the list', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([item()]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv1', 'r1', { status: 'completed' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await gone();
  });

  it.each([['outcome', item()], ['follow_up', followUpItem], ['heard_back', heardBackItem]])(
    'Rejected on a %s row asks the reason before saving, then the row leaves the list',
    async (_need, row) => {
      mocks.getNeedsInput.mockResolvedValueOnce(feed([row]));
      mocks.updateInterviewStage.mockResolvedValue({});
      renderPage();
      fireEvent.click(within(await section()).getByRole('button', { name: 'Rejected' }));
      const dialog = await screen.findByRole('dialog', { name: /Reject round/ });
      const save = within(dialog).getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.click(save);
      expect(mocks.updateInterviewStage).not.toHaveBeenCalled();
      fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'experience' } });
      fireEvent.click(save);
      await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith(
        row.interviewId, row.roundId, { status: 'rejected', statusNote: '', statusReason: 'experience' },
      ));
      await gone();
    },
  );

  it('Canceled asks the reason before saving', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([item()]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Canceled' }));
    const dialog = await screen.findByRole('dialog', { name: /Cancel round/ });
    const save = within(dialog).getByRole('button', { name: 'Save as Canceled' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why was it canceled\?/), { target: { value: 'company' } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'canceled', statusNote: '', statusReason: 'company' },
    ));
  });

  it('Passed opens the optional feedback dialog and needs no reason', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([followUpItem]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Passed' }));
    const dialog = await screen.findByRole('dialog', { name: /Passed to next round · Globex/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Passed' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv2', 'r2', { status: 'passed', statusNote: '' }));
  });

  it('Rescheduled opens the Change time dialog and sends the new time with the reason', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([item()]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Rescheduled' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change time · Tech round 1' });
    expect((within(dialog).getByLabelText('Date') as HTMLInputElement).value).toMatch(/^2026-11-1[01]$/);
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-25' } });
    const save = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why was it rescheduled\?/), { target: { value: 'technical' } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv1', 'r1', {
      scheduledAt: expect.stringMatching(/^2026-11-2[456]T/), rescheduleReason: 'technical', rescheduleNote: '',
    }));
    expect(mocks.getInterview).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await gone();
  });

  it('"I followed up" records the follow-up and the row leaves the list', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([followUpItem]));
    mocks.followUpInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'I followed up' }));
    await waitFor(() => expect(mocks.followUpInterviewStage).toHaveBeenCalledWith('iv2', 'r2'));
    expect(mocks.updateInterviewStage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await gone();
  });

  it('"No, close as rejected" saves rejected with "No answer from the company" in one click', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([heardBackItem]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'No, close as rejected' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith(
      'iv3', 'r3', { status: 'rejected', statusReason: 'no_answer' },
    ));
    await gone();
  });

  it("a row's buttons are disabled while its save is in flight, the other rows stay usable", async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([item(), followUpItem]));
    let done: (v: unknown) => void = () => {};
    mocks.updateInterviewStage.mockReturnValue(new Promise((resolve) => { done = resolve; }));
    renderPage();
    const rows = within(await section()).getAllByRole('listitem');
    const disabled = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => (b as HTMLButtonElement).disabled);
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(disabled(rows[0])).toEqual([true, true, true, true, true]));
    expect(disabled(rows[1])).toEqual([false, false, false]);
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Completed' }));
    expect(mocks.updateInterviewStage).toHaveBeenCalledTimes(1);
    done({});
    await waitFor(() => expect(disabled(within(screen.getByRole('region', { name: /Needs your input/ })).getAllByRole('listitem')[0]))
      .toEqual([false, false, false, false, false]));
  });

  it('a failed save keeps the row and gives its buttons back', async () => {
    mocks.getNeedsInput.mockResolvedValue(feed([followUpItem]));
    mocks.followUpInterviewStage.mockRejectedValue(new Error('nope'));
    renderPage();
    const button = within(await section()).getByRole('button', { name: 'I followed up' }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(mocks.followUpInterviewStage).toHaveBeenCalled());
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(within(await section()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('a reason row opens the reason dialog and sends only the reason, keeping the round status and note', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce(feed([reasonItem]));
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage();
    fireEvent.click(within(await section()).getByRole('button', { name: 'Add reason' }));
    const dialog = await screen.findByRole('dialog', { name: /Umbrella · Tech round 1/ });
    fireEvent.change(within(dialog).getByLabelText(/Why was it canceled\?/), { target: { value: 'company' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Canceled' }));
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv4', 'r4', { statusReason: 'company' }));
    await gone();
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
    mocks.getNeedsInput.mockResolvedValue(feed([item(), followUpItem, heardBackItem, reasonItem]));
    renderPage();
    const box = await section();
    expect(within(box).getAllByText('Maya Owner')).toHaveLength(4);
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

describe('Interviews page: Region filter and the totals strip', () => {
  function Search() {
    return <p data-testid="search">{useLocation().search}</p>;
  }
  function renderPage(url: string) {
    const page = (view: 'list' | 'calendar', callers = false) => <><InterviewsPage view={view} callers={callers} /><Search /></>;
    return render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/interviews" element={page('list')} />
            <Route path="/interviews/calendar" element={page('calendar')} />
            <Route path="/interviews/callers" element={page('list', true)} />
            <Route path="/interviews/callers/calendar" element={page('calendar', true)} />
          </Routes>
        </MemoryRouter>
      </SWRConfig>,
    );
  }
  const search = () => screen.getByTestId('search').textContent;
  const strip = () => screen.findByRole('group', { name: 'Round totals' });
  const last = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.at(-1)![0] as Record<string, unknown>;
  const labels = () => within(screen.getByRole('group', { name: 'Filters' })).getAllByText(/./, { selector: 'label' }).map((l) => l.textContent);
  const summary = { total: 1234, byStatus: { scheduled: 1000, completed: 200, passed: 30, rejected: 3, canceled: 1 } };

  it('Self interviews: Region sits after Profile, goes to the URL and to the list request', async () => {
    renderPage('/interviews?page=2');
    await waitFor(() => expect(mocks.listInterviews).toHaveBeenCalled());
    expect('region' in last(mocks.listInterviews)).toBe(false);
    expect(labels().slice(0, 3)).toEqual(['User', 'Profile', 'Region']);
    const region = screen.getByLabelText('Region') as HTMLSelectElement;
    expect([...region.options].map((o) => [o.value, o.text])).toEqual([
      ['', 'All regions'], ['Latam', 'Latam'], ['EU', 'EU'], ['Canada', 'Canada'], ['US', 'US'], ['Asia', 'Asia'], ['none', 'No region'],
    ]);
    fireEvent.change(region, { target: { value: 'EU' } });
    await waitFor(() => expect(search()).toBe('?region=EU'));
    await waitFor(() => expect(last(mocks.listInterviews)).toMatchObject({ region: 'EU', page: 1 }));
    expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/interviews/calendar?region=EU');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(search()).toBe(''));
  });

  it('Caller interviews: Region sits after Caller and goes to the caller rounds request', async () => {
    renderPage('/interviews/callers?region=none');
    await waitFor(() => expect(mocks.listCallerRounds).toHaveBeenCalled());
    expect(labels().slice(0, 3)).toEqual(['User', 'Caller', 'Region']);
    expect((screen.getByLabelText('Region') as HTMLSelectElement).value).toBe('none');
    expect(last(mocks.listCallerRounds).region).toBe('none');
  });

  it('the calendar sends the region, and the strip counts the days the calendar shows', async () => {
    renderPage('/interviews/calendar?region=Asia&stage=intro');
    await waitFor(() => expect(mocks.listInterviewRounds).toHaveBeenCalled());
    await waitFor(() => expect(mocks.getInterviewSummary).toHaveBeenCalled());
    const { from, to, ...rest } = last(mocks.listInterviewRounds);
    expect(rest).toEqual({ creatorId: 'me', callType: 'self', region: 'Asia', stage: 'intro' });
    // The calendar's `to` is the midnight after its last day; the summary's is inclusive.
    expect(last(mocks.getInterviewSummary)).toEqual({ ...rest, from, to: new Date(Date.parse(to as string) - 1).toISOString() });
    await strip();
  });

  it('shows the total and every status count, and says it counts rounds', async () => {
    mocks.getInterviewSummary.mockResolvedValue(summary);
    renderPage('/interviews');
    const el = await strip();
    expect(within(el).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Total 1,234 rounds', 'Scheduled 1,000', 'Completed 200', 'Passed 30', 'Rejected 3', 'Canceled 1',
    ]);
    expect(within(el).getByText('counts rounds, not companies')).toBeTruthy();
  });

  it('marks the active status; a status sets the filter, the same one again or Total clears it', async () => {
    mocks.getInterviewSummary.mockResolvedValue(summary);
    renderPage('/interviews?status=passed&page=3');
    const btn = async (name: RegExp) => within(await strip()).getByRole('button', { name });
    const pressed = async () => within(await strip()).getAllByRole('button', { pressed: true }).map((b) => b.textContent);
    expect(await pressed()).toEqual(['Passed 30']);
    expect((await btn(/^Total/)).hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(await btn(/^Scheduled/));
    await waitFor(() => expect(search()).toBe('?status=scheduled'));
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('scheduled');
    expect(await pressed()).toEqual(['Scheduled 1,000']);
    fireEvent.click(await btn(/^Scheduled/));
    await waitFor(() => expect(search()).toBe(''));
    fireEvent.click(await btn(/^Rejected/));
    await waitFor(() => expect(search()).toBe('?status=rejected'));
    fireEvent.click(await btn(/^Total/));
    await waitFor(() => expect(search()).toBe(''));
  });

  it('Self interviews: the strip sends the filters the list sends', async () => {
    renderPage('/interviews?user=all&profile=a1&region=EU&stage=intro&status=passed&q=acme&range=next_week&page=2&sort=company');
    await waitFor(() => expect(mocks.getInterviewSummary).toHaveBeenCalled());
    const { page, limit, sort, dir, ...filters } = last(mocks.listInterviews);
    expect(filters).toMatchObject({ accountId: 'a1', region: 'EU', stage: 'intro', status: 'passed', q: 'acme', callType: 'self' });
    expect(filters.from && filters.to).toBeTruthy();
    expect(last(mocks.getInterviewSummary)).toEqual(filters);
  });

  it('Caller interviews: the strip sends the filters the list sends, for caller rounds only', async () => {
    renderPage('/interviews/callers?owner=u2&caller=c1&region=EU&stage=intro&q=acme');
    await waitFor(() => expect(mocks.getInterviewSummary).toHaveBeenCalled());
    const { page, limit, dir, ...filters } = last(mocks.listCallerRounds);
    expect(filters).toMatchObject({ creatorId: 'u2', callerId: 'c1', region: 'EU', stage: 'intro', q: 'acme' });
    expect(last(mocks.getInterviewSummary)).toEqual({ ...filters, callerOnly: true });
    await strip();
  });

  it('the Caller interviews calendar counts caller rounds only', async () => {
    renderPage('/interviews/callers/calendar?caller=c1');
    await waitFor(() => expect(mocks.getInterviewSummary).toHaveBeenCalled());
    expect(last(mocks.getInterviewSummary)).toMatchObject({ callerOnly: true, callerId: 'c1' });
    expect('callType' in last(mocks.getInterviewSummary)).toBe(false);
  });

  it('shows a skeleton while the totals load', async () => {
    mocks.getInterviewSummary.mockReturnValue(new Promise(() => {}));
    renderPage('/interviews');
    expect(await screen.findByTestId('interview-totals-loading')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Round totals' })).toBeNull();
  });

  it('a failed totals request shows nothing, is logged once, and the list still works', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('boom');
    mocks.getInterviewSummary.mockRejectedValue(failure);
    mocks.listInterviews.mockResolvedValue({
      interviews: [{ _id: 'iv1', companyName: 'Acme Corp', createdBy: 'me', stageHistory: [] }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    renderPage('/interviews');
    await waitFor(() => expect(logged).toHaveBeenCalledWith('Interview totals failed to load', failure));
    expect((await screen.findAllByText('Acme Corp')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Round totals' })).toBeNull();
    expect(screen.queryByTestId('interview-totals-loading')).toBeNull();
    expect(logged.mock.calls.filter(([m]) => m === 'Interview totals failed to load')).toHaveLength(1);
    logged.mockRestore();
  });

  it('refetches the totals when an edit refreshes the list', async () => {
    mocks.getNeedsInput.mockResolvedValueOnce({
      items: [{
        interviewId: 'iv1', roundId: 'r1', companyName: 'Acme Corp', profileName: 'John D', ownerId: 'me', ownerName: 'Maya Owner',
        stage: 'tech1', status: 'scheduled', scheduledAt: '2026-11-10T15:00:00Z', need: 'outcome',
      }],
      counts: { outcome: 1, follow_up: 0, heard_back: 0, reason: 0 },
    });
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage('/interviews');
    await strip();
    const before = mocks.getInterviewSummary.mock.calls.length;
    fireEvent.click(within(await screen.findByRole('region', { name: /Needs your input/ })).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(mocks.getInterviewSummary.mock.calls.length).toBeGreaterThan(before));
  });

  it('refetches the totals when a status is changed in a list row', async () => {
    mocks.listInterviews.mockResolvedValue({
      interviews: [{
        _id: 'iv1', companyName: 'Acme Corp', createdBy: 'me', status: 'scheduled',
        stageHistory: [{ id: 'r1', stage: 'intro', status: 'scheduled', scheduledAt: '2030-01-01T10:00:00Z' }],
      }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    mocks.updateInterviewStage.mockResolvedValue({});
    renderPage('/interviews');
    await strip();
    const select = (await screen.findAllByLabelText('Status of Acme Corp'))[0];
    const before = mocks.getInterviewSummary.mock.calls.length;
    fireEvent.change(select, { target: { value: 'completed' } });
    await waitFor(() => expect(mocks.updateInterviewStage).toHaveBeenCalledWith('iv1', 'r1', { status: 'completed' }));
    await waitFor(() => expect(mocks.getInterviewSummary.mock.calls.length).toBeGreaterThan(before));
  });
});
