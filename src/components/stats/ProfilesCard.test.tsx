// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ProfileReport, ProfileRow } from '../../api/endpoints';
import ProfilesCard from './ProfilesCard';

const getProfileReport = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getProfileReport: (...a: unknown[]) => getProfileReport(...a) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const row = (o: Partial<ProfileRow> = {}): ProfileRow => ({
  accountId: 'a1', name: 'Alpha', region: 'EU', archived: false, bidsSelf: 40, bidsBidder: 0, matured: 40,
  maturedInterviews: 8, interviews: 8, reach: { intro: 8, tech: 8, final: 0 }, stillInPlay: 0, per100: 20,
  days: { first: 5, median: 5, slowest: 9 }, grade: 'strong', reasons: [], ...o,
});
const report = (o: Partial<ProfileReport> = {}): ProfileReport => ({
  label: 'May 3 – Nov 20, 2026', subject: { userId: 'me', name: 'Ana' },
  window: { median: null, p90: 14, matured_days: 14, n: 14, thin: false },
  coverage: { rows: 32, headerBids: 40, noLink: 0, unmatchedInterviews: 0 },
  team: { per100: 10, medianDays: 5, profiles: 3 }, profiles: [row()], ...o,
});
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = (p: typeof params | null = params, user = '') => render(
  <SWRConfig value={{ provider: () => new Map() }}><ProfilesCard params={p} user={user} /></SWRConfig>,
);
const load = (r: ProfileReport) => getProfileReport.mockResolvedValue(r);

beforeEach(() => getProfileReport.mockReset());
afterEach(cleanup);

describe('ProfilesCard', () => {
  it('renders coverage line with percent and unmatched interviews', async () => {
    load(report({ coverage: { rows: 32, headerBids: 40, noLink: 0, unmatchedInterviews: 2 } }));
    show();
    expect(await screen.findByText(/Job-level numbers cover 32 of 40 bids \(80%\); typed self bids aren't tied to jobs\. 2 interviews couldn't be tied to a job\./)).toBeTruthy();
  });

  it('uses singular for one unmatched interview and dash when no header bids', async () => {
    load(report({ coverage: { rows: 0, headerBids: 0, noLink: 0, unmatchedInterviews: 1 } }));
    show();
    expect(await screen.findByText(/cover 0 of 0 bids \(—\).* 1 interview couldn't be tied to a job\./)).toBeTruthy();
  });

  it('drops the bids share and unmatched sentence when the server leaves them null (one profile / team)', async () => {
    load(report({ coverage: { rows: 32, headerBids: null, noLink: 0, unmatchedInterviews: null } }));
    show();
    expect(await screen.findByText('Job-level numbers cover 32 applications.')).toBeTruthy();
  });

  it('sends scope and profile', async () => {
    load(report());
    render(<SWRConfig value={{ provider: () => new Map() }}><ProfilesCard params={{ ...params, scope: 'profile', profile: 'a1' }} user="" /></SWRConfig>);
    await screen.findByText('Alpha');
    expect(getProfileReport).toHaveBeenCalledWith(expect.objectContaining({ scope: 'profile', profile: 'a1' }));
  });

  it('says job-level rows exceed typed bids instead of a share over 100%', async () => {
    load(report({ coverage: { rows: 50, headerBids: 40, noLink: 0, unmatchedInterviews: 0 } }));
    show();
    expect(await screen.findByText('Job-level numbers cover 50 applications; you counted 40 bids this period.')).toBeTruthy();
    expect(screen.queryByText(/%\)/)).toBeNull();
  });

  it('renders a row per profile with grade, per-100 and days', async () => {
    load(report({ profiles: [row(), row({ accountId: 'a2', name: 'Beta', grade: 'watch', reasons: ['below team'], per100: 5.5, archived: true })] }));
    show();
    expect(await screen.findByText('Your profiles')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('✅ Strong')).toBeTruthy();
    expect(screen.getByText('⚠ Watch')).toBeTruthy();
    expect(screen.getByText('20.0')).toBeTruthy();
    expect(screen.getByText('5.5')).toBeTruthy();
    expect(screen.getAllByText('5 · 5 · 9').length).toBe(2);
    expect(screen.getAllByText('8 intro · 8 tech · 0 final').length).toBeTruthy();
    expect(screen.getByText('archived')).toBeTruthy();
  });

  it('shows matured interviews with a muted count of recent ones', async () => {
    load(report({ profiles: [row({ interviews: 5, maturedInterviews: 3, reach: { intro: 5, tech: 1, final: 0 } })] }));
    show();
    expect(await screen.findByText('3')).toBeTruthy();
    expect(screen.getByText('+2 recent')).toBeTruthy();
    expect(screen.getByText('5 intro · 1 tech · 0 final')).toBeTruthy();
  });

  it('shows no recent note when every interview is matured', async () => {
    load(report());
    show();
    await screen.findByText('Alpha');
    expect(screen.queryByText(/recent/)).toBeNull();
  });

  it('explains the grades in the legend', async () => {
    load(report());
    show();
    expect(await screen.findByText(/Grade: ✅ at\/above team and reaches tech · ⚠ below team, slow, or stuck at intro · ⛔ no interview where the team rate would have given 3\+ · ⏳ fewer than 30 matured bids, or too few to tell yet\./)).toBeTruthy();
  });

  it('renders no region chip when the profile has no region', async () => {
    load(report({ profiles: [row({ region: null })] }));
    const { container } = show();
    await screen.findByText('Alpha');
    expect(container.querySelectorAll('tbody td:first-child .rounded').length).toBe(0);
  });

  it('shows dashes for missing per-100 and days', async () => {
    load(report({ profiles: [row({ per100: null, days: null, grade: 'early', reach: { intro: 0, tech: 0, final: 0 }, interviews: 0 })] }));
    show();
    expect(await screen.findByText('⏳ Too early')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('no interviews')).toBeTruthy();
  });

  it('legend calls the line the team rate', async () => {
    load(report());
    show();
    expect(await screen.findByText(/line = team rate \(10\.0 per 100\)/)).toBeTruthy();
    expect(screen.queryByText(/team median/)).toBeNull();
  });

  it('states the fixed matured days even when the window is thin', async () => {
    load(report({ window: { median: null, p90: 14, matured_days: 14, n: 14, thin: true } }));
    show();
    expect(await screen.findByText(/Bids made in May 3 – Nov 20, 2026 that had 14\+ days to work/)).toBeTruthy();
    expect(screen.queryByText(/Not enough interviews yet/)).toBeNull();
  });

  it('shows the empty state', async () => {
    load(report({ profiles: [] }));
    show();
    expect(await screen.findByText('No job-level bids in this period yet.')).toBeTruthy();
  });

  it("titles another user's report with their name", async () => {
    load(report({ subject: { userId: 'u7', name: 'Michael' } }));
    show(params, 'u7');
    expect(await screen.findByText("Michael's profiles")).toBeTruthy();
    expect(getProfileReport).toHaveBeenCalledWith(expect.objectContaining({ user: 'u7' }));
  });

  it('renders nothing without params', () => {
    const { container } = show(null);
    expect(container.innerHTML).toBe('');
    expect(getProfileReport).not.toHaveBeenCalled();
  });
});

describe('ProfilesCard immature note', () => {
  it('shows the note + button when every profile matured 0, hides otherwise', async () => {
    load(report({ profiles: [row({ matured: 0, per100: null })] }));
    const fn = vi.fn();
    render(<SWRConfig value={{ provider: () => new Map() }}><ProfilesCard params={params} user="" onShowLastMonth={fn} /></SWRConfig>);
    expect(await screen.findByText(/None of these bids have had 14 days to get an interview yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show last month' }));
    expect(fn).toHaveBeenCalledTimes(1);
    cleanup();
    load(report());
    show();
    await screen.findByText('Your profiles');
    expect(screen.queryByText(/None of these bids/)).toBeNull();
  });
});
