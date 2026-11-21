// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import * as api from '../../api/endpoints';
import PendingItems from './PendingItems';

vi.mock('../../api/endpoints', () => ({
  getDashboardPending: vi.fn(), getNeedsInput: vi.fn(), followUpInterviewStage: vi.fn(), updateInterviewStage: vi.fn(),
}));
const auth = vi.hoisted(() => ({ role: 'staff' }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));
vi.mock('../../lib/useInterviewTimezone', () => ({ useInterviewTimezone: () => ({ tz: 'America/Chicago' }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-18T19:00:00-06:00'));
  auth.role = 'staff';
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const round = (o: object = {}) => ({
  interviewId: 'iv1', roundId: 'r1', companyName: 'Liberty', profileName: 'John D', ownerId: 'me', ownerName: 'Me',
  stage: 'intro', status: 'completed', scheduledAt: '2026-11-10T15:00:00Z', endsAt: '2026-11-10T16:00:00Z', need: 'follow_up', ...o,
});
const unknown = round({ interviewId: 'iv0', roundId: 'r0', companyName: 'KOPE AI', status: 'scheduled', need: 'outcome', scheduledAt: '2026-10-07T15:00:00Z', endsAt: '2026-10-07T16:00:00Z' });
const heardBack = round({
  interviewId: 'iv2', roundId: 'r2', companyName: 'Smart Working', need: 'heard_back',
  scheduledAt: '2026-10-08T15:00:00Z', endsAt: '2026-10-08T16:00:00Z', followedUpAt: '2026-11-11T12:00:00Z',
});
const noReason = round({ interviewId: 'iv3', roundId: 'r3', companyName: 'techmagic', status: 'canceled', need: 'reason', scheduledAt: '2026-11-17T15:00:00Z' });
const profiles = [
  { accountId: 'a1', name: 'Ross Chuan', kind: 'no_interviews', idleDays: 16, capped: false, bids: 412, tailorScore: 71 },
  { accountId: 'a2', name: 'Theo Deng', kind: 'no_bids', idleDays: 21, capped: false, bids: null, tailorScore: null },
];
const bidders = [
  { bidderId: 'b1', name: 'Ali', kind: 'not_bidding', days: 2, recent: null, before: null },
  { bidderId: 'b2', name: 'Sam', kind: 'slowing', days: null, recent: [48, 52, 40], before: 112.4 },
];
const pending = (o: { interviews?: object[]; profiles?: object[]; bidders?: object[] } = {}) => {
  const p = { interviews: [], profiles: [], bidders: [], ...o };
  const counts = { interviews: p.interviews.length, profiles: p.profiles.length, bidders: p.bidders.length, total: 0 };
  vi.mocked(api.getDashboardPending).mockResolvedValue({ ...p, counts } as never);
};
/** A round of today (Nov 18, Chicago) that ended at 4:25 PM and nobody marked. */
const todayRound = (o: object = {}) => ({
  interviewId: 'ivt', roundId: 'rt', companyName: 'Globex', profileName: 'Data', stage: 'tech1', status: 'scheduled', state: 'unmarked',
  scheduledAt: '2026-11-18T22:00:00Z', endsAt: '2026-11-18T22:25:00Z', rescheduledTo: null,
  who: { kind: 'self', name: null, assigned: false, confirmed: false }, steps: [{ stage: 'tech1', state: 'today' }], ...o,
});
const onSaved = vi.fn();
const show = (props: Partial<Parameters<typeof PendingItems>[0]> = {}) => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter><PendingItems mode="owner" today={[]} onSaved={onSaved} {...props} /></MemoryRouter>
  </SWRConfig>,
);
const asAdmin = (props: object = {}) => show({ mode: 'admin', userId: 'u7', name: 'Puma', ...props });
const block = () => screen.findByRole('group', { name: /Pending items/ });
const rowsOf = (box: HTMLElement, group: string) => within(within(box).getByRole('list', { name: group })).getAllByRole('listitem');
const buttons = (el: HTMLElement) => within(el).queryAllByRole('button').map((b) => b.textContent);

describe('PendingItems', () => {
  it('is hidden when nothing waits', async () => {
    pending();
    show();
    await waitFor(() => expect(api.getDashboardPending).toHaveBeenCalledWith(undefined));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Pending items/)).toBeNull();
  });

  it('admin: three groups with their counts, tags, texts, buttons and links; the heading counts them all', async () => {
    pending({ interviews: [noReason, heardBack, round(), unknown], profiles, bidders });
    asAdmin();
    const box = await block();
    expect(api.getDashboardPending).toHaveBeenCalledWith('u7');
    expect(within(box).getByRole('heading', { name: 'Pending items (8)' })).toBeTruthy();
    expect(within(box).getByText('Things waiting on Puma')).toBeTruthy();
    expect(within(box).getByText('Interviews (4)')).toBeTruthy();
    expect(within(box).getByText('Profiles (2)')).toBeTruthy();
    expect(within(box).getByText('Bidders (2)')).toBeTruthy();

    const [a, b, c, d] = rowsOf(box, 'Interviews');
    expect(a.textContent).toContain('Status unknownKOPE AI · Intro, Oct 7 · ended, never marked');
    expect(buttons(a)).toEqual(['Completed', 'Passed', 'Rejected', 'Rescheduled', 'Canceled']);
    expect(b.textContent).toContain('Follow-up dueLiberty · Intro, Nov 10 · no result for 8 days');
    expect(buttons(b)).toEqual(['Passed', 'Rejected']);
    expect(c.textContent).toContain('Heard back?Smart Working · Intro, Oct 8 · followed up Nov 11');
    expect(buttons(c)).toEqual(['No, close as rejected', 'Passed', 'Rejected']);
    expect(d.textContent).toContain('No reasontechmagic · Intro, Nov 17 · canceled with no reason');
    expect(buttons(d)).toEqual(['Add reason']);
    // "I followed up" stays with the owner
    expect(within(box).queryByRole('checkbox')).toBeNull();

    const [p1, p2] = rowsOf(box, 'Profiles');
    expect(p1.textContent).toContain('No interviewsRoss Chuan · no interview for 16 days · 412 bids in that time, resume score 71 on average');
    expect(within(p1).getByRole('link', { name: /What to change/ }).getAttribute('href')).toBe('/statistics?tab=conversion&scope=me&user=u7');
    expect(p2.textContent).toContain('No bidsTheo Deng · no bids, self or bidder, for 21 days · archive it?');
    expect(within(p2).getByRole('link', { name: /Open profile/ }).getAttribute('href')).toBe('/accounts/a2');

    const [b1, b2] = rowsOf(box, 'Bidders');
    expect(b1.textContent).toContain('Not biddingAli · no bids for 2 working days');
    expect(within(b1).getByRole('link', { name: /Open bidder/ }).getAttribute('href')).toBe('/bidders?bidder=b1');
    expect(b2.textContent).toContain('Slowing downSam · 48, 52 and 40 bids the last 3 days · 112 a day before');
    expect(within(b2).getByRole('link', { name: /Open bidder/ }).getAttribute('href')).toBe('/bidders?bidder=b2');
  });

  it('admin: each group folds on its heading, open at first', async () => {
    pending({ interviews: [round()], profiles, bidders });
    asAdmin();
    const box = await block();
    const heads = () => within(box).getAllByRole('button', { name: /^(Interviews|Profiles|Bidders) \(/ }).map((b) => [b.getAttribute('aria-label') ?? b.textContent!.replace(/^[▾▸] /, ''), b.getAttribute('aria-expanded')]);
    expect(heads()).toEqual([['Interviews (1)', 'true'], ['Profiles (2)', 'true'], ['Bidders (2)', 'true']]);
    fireEvent.click(within(box).getByRole('button', { name: 'Profiles (2)' }));
    expect(heads()).toEqual([['Interviews (1)', 'true'], ['Profiles (2)', 'false'], ['Bidders (2)', 'true']]);
    expect(within(box).queryByRole('list', { name: 'Profiles' })).toBeNull();
    expect(rowsOf(box, 'Bidders')).toHaveLength(2);
    expect(within(box).getByRole('heading', { name: 'Pending items (5)' })).toBeTruthy(); // folding hides rows, not the count
    fireEvent.click(within(box).getByRole('button', { name: 'Profiles (2)' }));
    expect(rowsOf(box, 'Profiles')).toHaveLength(2);
  });

  it('admin: a group lists its first 5 rows, then "… n more" shows the rest', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...profiles[1], accountId: `p${i}`, name: `Profile ${i}` }));
    pending({ profiles: many, bidders });
    asAdmin();
    const box = await block();
    expect(within(box).getByText('Profiles (8)')).toBeTruthy();
    expect(rowsOf(box, 'Profiles').map((r) => within(r).getByText(/^Profile \d$/).textContent)).toEqual(['Profile 0', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4']);
    expect(within(box).getAllByRole('button', { name: /… \d+ more/ }).map((b) => b.textContent)).toEqual(['… 3 more profiles']); // Bidders has 2: no cut
    fireEvent.click(within(box).getByRole('button', { name: '… 3 more profiles' }));
    expect(rowsOf(box, 'Profiles')).toHaveLength(8);
    expect(within(box).queryByRole('button', { name: /… \d+ more/ })).toBeNull();
  });

  it('owner: the groups fold and cut the same way', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...profiles[1], accountId: `p${i}`, name: `Profile ${i}` }));
    pending({ profiles: many });
    show();
    const box = await block();
    expect(rowsOf(box, 'Profiles')).toHaveLength(5);
    fireEvent.click(within(box).getByRole('button', { name: '… 3 more profiles' }));
    expect(rowsOf(box, 'Profiles')).toHaveLength(8);
    fireEvent.click(within(box).getByRole('button', { name: 'Profiles (8)' }));
    expect(within(box).queryByRole('list')).toBeNull();
  });

  it("owner, with listToday: today's unmarked rounds are listed here, once, with the follow-up checkbox kept", async () => {
    pending({ interviews: [round(), { ...unknown, interviewId: 'ivt', roundId: 'rt', companyName: 'Globex', stage: 'tech1' }] });
    show({ listToday: true, today: [todayRound(), todayRound({ interviewId: 'ivu', roundId: 'ru', companyName: 'Fresh' })] as never });
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (3)' })).toBeTruthy();
    expect(rowsOf(box, 'Interviews').map((r) => r.textContent?.split(' · ')[0])).toEqual(['Status unknownGlobex', 'Status unknownFresh', 'Follow-up dueLiberty']);
    expect(within(box).getByRole('checkbox', { name: 'I followed up with Liberty' })).toBeTruthy();
  });

  it('a group with nothing in it is left out', async () => {
    pending({ profiles: [profiles[1]] });
    asAdmin();
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (1)' })).toBeTruthy();
    expect(within(box).getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Profiles']);
    expect(within(box).queryByText(/Interviews \(|Bidders \(/)).toBeNull();
  });

  it('a profile without its numbers leaves those parts out; a capped wait says "or more"', async () => {
    pending({ profiles: [
      { ...profiles[0], bids: null, tailorScore: null },
      { ...profiles[0], accountId: 'a3', name: 'Bids only', tailorScore: null },
      { ...profiles[1], accountId: 'a4', name: 'Long idle', idleDays: 60, capped: true },
    ] });
    asAdmin();
    const [x, y, z] = rowsOf(await block(), 'Profiles');
    expect(x.textContent).toContain('Ross Chuan · no interview for 16 daysWhat to change');
    expect(y.textContent).toContain('Bids only · no interview for 16 days · 412 bids in that timeWhat to change');
    expect(z.textContent).toContain('Long idle · no bids, self or bidder, for 60 days or more · archive it?');
  });

  it("admin: today's unmarked rounds are listed as Status unknown, once", async () => {
    pending({ interviews: [round(), { ...unknown, interviewId: 'ivt', roundId: 'rt', companyName: 'Globex', stage: 'tech1' }] });
    asAdmin({ today: [todayRound(), todayRound({ interviewId: 'ivu', roundId: 'ru', companyName: 'Fresh' }), todayRound({ interviewId: 'ivd', roundId: 'rd', companyName: 'Done', state: 'completed', status: 'completed' })] });
    const box = await block();
    expect(within(box).getByRole('heading', { name: 'Pending items (3)' })).toBeTruthy();
    const rows = rowsOf(box, 'Interviews');
    expect(rows.map((r) => r.textContent?.split(' · ')[0])).toEqual(['Status unknownGlobex', 'Status unknownFresh', 'Follow-up dueLiberty']);
    expect(rows[0].textContent).toContain('Globex · Tech round 1 · ended today 4:25 PM, not marked');
    expect(buttons(rows[1])).toEqual(['Completed', 'Passed', 'Rejected', 'Rescheduled', 'Canceled']);
  });

  it("owner: today's unmarked rounds are not repeated here, follow-up rows keep their checkbox, links carry no user", async () => {
    pending({ interviews: [round(), unknown, { ...unknown, interviewId: 'ivt', roundId: 'rt', companyName: 'Globex' }], profiles: [profiles[0]] });
    show({ today: [todayRound()] as never });
    const box = await block();
    expect(api.getDashboardPending).toHaveBeenCalledWith(undefined);
    expect(within(box).getByRole('heading', { name: 'Pending items (3)' })).toBeTruthy();
    expect(within(box).getByText('Things waiting on you')).toBeTruthy();
    expect(box.textContent).not.toContain('Globex');
    const [a, b] = rowsOf(box, 'Interviews');
    expect(a.textContent).toContain('Status unknownKOPE AI');
    expect(within(a).queryByRole('checkbox')).toBeNull();
    expect(within(b).getByRole('checkbox', { name: 'I followed up with Liberty' })).toBeTruthy();
    expect(buttons(b)).toEqual(['Passed', 'Rejected']);
    expect(within(box).getByRole('link', { name: /What to change/ }).getAttribute('href')).toBe('/statistics?tab=conversion&scope=me');
  });

  it('owner: ticking a follow-up records it, disables the row meanwhile and tells the page', async () => {
    pending({ interviews: [round()] });
    let done: (v: unknown) => void = () => {};
    vi.mocked(api.followUpInterviewStage).mockReturnValue(new Promise((resolve) => { done = resolve; }) as never);
    show();
    const box = await block();
    const tick = within(box).getByRole('checkbox', { name: 'I followed up with Liberty' }) as HTMLInputElement;
    fireEvent.click(tick);
    expect(api.followUpInterviewStage).toHaveBeenCalledWith('iv1', 'r1');
    await waitFor(() => expect(tick.disabled).toBe(true));
    // the row's own buttons (the group's fold button stays usable)
    expect(within(tick.closest('li')!).getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    done({});
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('admin: Rejected asks the reason and sends what the Interviews page sends', async () => {
    pending({ interviews: [round()] });
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    asAdmin();
    fireEvent.click(within(await block()).getByRole('button', { name: 'Rejected' }));
    const dialog = await screen.findByRole('dialog', { name: /Reject round · Liberty/ });
    const save = within(dialog).getByRole('button', { name: 'Save as Rejected' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why was it rejected\?/), { target: { value: 'experience' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith(
      'iv1', 'r1', { status: 'rejected', statusNote: '', statusReason: 'experience' },
    ));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('admin: Completed and "No, close as rejected" save in one click', async () => {
    pending({ interviews: [unknown, heardBack] });
    vi.mocked(api.updateInterviewStage).mockResolvedValue({} as never);
    asAdmin();
    const box = await block();
    fireEvent.click(within(box).getByRole('button', { name: 'Completed' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv0', 'r0', { status: 'completed' }));
    fireEvent.click(within(box).getByRole('button', { name: 'No, close as rejected' }));
    await waitFor(() => expect(api.updateInterviewStage).toHaveBeenCalledWith('iv2', 'r2', { status: 'rejected', statusReason: 'no_answer' }));
  });

  it('an old server without the pending read: the interviews still come from the needs-input list', async () => {
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('404'));
    vi.mocked(api.getNeedsInput).mockResolvedValue({ items: [round(), heardBack], counts: {} } as never);
    asAdmin();
    const box = await block();
    expect(api.getNeedsInput).toHaveBeenCalledWith('u7');
    expect(within(box).getByRole('heading', { name: 'Pending items (2)' })).toBeTruthy();
    expect(within(box).getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Interviews']);
  });

  it("owner who is an admin: the fallback asks for their own rounds by id and never shows someone else's", async () => {
    auth.role = 'admin';
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('404'));
    vi.mocked(api.getNeedsInput).mockResolvedValue({ items: [round(), round({ interviewId: 'iv8', roundId: 'r8', companyName: 'Theirs', ownerId: 'other' })], counts: {} } as never);
    show();
    const box = await block();
    expect(api.getNeedsInput).toHaveBeenCalledWith('me');
    expect(within(box).getByRole('heading', { name: 'Pending items (1)' })).toBeTruthy();
    expect(box.textContent).not.toContain('Theirs');
  });

  it('both reads failing shows nothing and does not crash', async () => {
    vi.mocked(api.getDashboardPending).mockRejectedValue(new Error('500'));
    vi.mocked(api.getNeedsInput).mockRejectedValue(new Error('500'));
    show();
    await waitFor(() => expect(api.getNeedsInput).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Pending items/)).toBeNull();
  });
});
