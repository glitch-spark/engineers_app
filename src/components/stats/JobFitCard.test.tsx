// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { JobFitReport, RateCell, RateGroup } from '../../api/endpoints';
import JobFitCard from './JobFitCard';

const getJobFit = vi.fn();
vi.mock('../../api/endpoints', async (orig) => ({ ...(await orig<object>()), getJobFit: (...a: unknown[]) => getJobFit(...a) }));

const cell = (o: Partial<RateCell> = {}): RateCell => ({ bids: 40, matured: 40, interviews: 4, per100: 10, tooFew: false, ...o });
const grp = (label: string, you: Partial<RateCell> = {}, team: Partial<RateCell> = {}): RateGroup => ({ key: label, label, you: cell(you), team: cell({ per100: 10, ...team }) });
const report = (o: Partial<JobFitReport> = {}): JobFitReport => ({
  label: 'L', subject: { userId: 'me', name: 'Ana' },
  window: { median: null, p90: 14, matured_days: 14, n: 14, thin: false },
  bySite: [grp('Lever')], byScore: [grp('High')], byArea: [grp('Backend')], byAge: [grp('New')],
  known: { score: 5, area: 30 }, ...o,
});
const params = { period: 'month' as const, date: '2026-11-01', region: 'all' as const };
const show = () => render(<SWRConfig value={{ provider: () => new Map() }}><JobFitCard params={params} user="" /></SWRConfig>);

beforeEach(() => getJobFit.mockReset());
afterEach(cleanup);

describe('JobFitCard', () => {
  it('renders four tables with labels and rates', async () => {
    getJobFit.mockResolvedValue(report({ bySite: [grp('Lever', { per100: 12.5, bids: 33 }, { per100: 7.5 })] }));
    show();
    expect(await screen.findByText('What kind of job works')).toBeTruthy();
    for (const t of ['By job site', 'By resume score', 'By job area', 'By profile age (when the bid went out)']) expect(screen.getByText(t)).toBeTruthy();
    expect(screen.getAllByRole('table')).toHaveLength(4);
    const row = screen.getByText('Lever').closest('tr')!;
    expect(within(row).getByText('33')).toBeTruthy();
    expect(within(row).getByText('12.5')).toBeTruthy();
    expect(within(row).getByText('7.5')).toBeTruthy();
  });

  it('shows too few', async () => {
    getJobFit.mockResolvedValue(report({ bySite: [grp('Lever', { tooFew: true, per100: 50 }, { tooFew: true })] }));
    show();
    const row = (await screen.findByText('Lever')).closest('tr')!;
    expect(within(row).getAllByText('too few')).toHaveLength(2);
  });

  it('shows known-percent captions', async () => {
    getJobFit.mockResolvedValue(report());
    show();
    expect(await screen.findByText('Score known for 5% of your bids.')).toBeTruthy();
    expect(screen.getByText('Area known for 30% of your bids.')).toBeTruthy();
  });

  it('highlights much better / much worse than team', async () => {
    getJobFit.mockResolvedValue(report({ bySite: [
      grp('Good', { per100: 15 }, { per100: 10 }), grp('Bad', { per100: 5 }, { per100: 10 }),
      grp('Meh', { per100: 11 }, { per100: 10 }), grp('Thin', { per100: 20, tooFew: true }, { per100: 10 }),
    ] }));
    show();
    const you = async (l: string) => (await screen.findByText(l)).closest('tr')!.querySelectorAll('td')[2];
    expect(((await you('Good')).className)).toMatch(/font-medium.*text-green/);
    expect(((await you('Bad')).className)).toMatch(/font-medium.*text-red/);
    expect((await you('Meh')).className).not.toMatch(/font-medium/);
    expect((await you('Thin')).className).not.toMatch(/font-medium/);
  });

  it('empty state', async () => {
    const z = (l: string) => grp(l, { bids: 0, matured: 0, per100: null });
    getJobFit.mockResolvedValue(report({ bySite: [z('a')], byScore: [z('b')], byArea: [z('c')], byAge: [z('d')] }));
    show();
    expect(await screen.findByText('No job-level bids in this period yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
