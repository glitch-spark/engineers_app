// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StatsView } from '../../api/endpoints';
import StatsFrame from './StatsFrame';

vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children);
  return { ResponsiveContainer: Stub, LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub };
});

vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));

afterEach(cleanup);

const team = { median: 646, p25: 560, p75: 720, min: 482, max: 789, n: 9 };
const view = (o: Partial<StatsView> = {}): StatsView => ({
  tab: 'bids', label: 'Bids', subject: { userId: 'u7', name: 'Michael' },
  headline: [
    { key: 'bids', label: 'Your bids', value: 519, format: 'count', team, rank: 7, of: 9, vsMedian: -0.2, higherIsBetter: true, note: 'Self 214 · bidder 305' },
    { key: 'rank', label: 'Your rank', value: 7, format: 'rank', team: null, rank: 7, of: 9, vsMedian: null, higherIsBetter: false, note: 'of 9' },
    { key: 'perDay', label: 'Per working day', value: 40.4, format: 'count', team: { ...team, median: 50 }, rank: 7, of: 9, vsMedian: -0.1, higherIsBetter: true, note: 'team 50 · target 54' },
  ],
  tips: [
    { id: 'a', severity: 'bad', text: 'Self bids are low', detail: 'Self 214 vs 370', evidence: {} },
    { id: 'b', severity: 'good', text: 'Bidder bids up', detail: '', evidence: {} },
  ],
  everyone: { rowKind: 'person', metric: 'bids', rows: [
    { userId: 'u1', name: 'Justin', value: 789, vsMedian: 0.22, rank: 1, parts: { self: 400, bidder: 389 }, isSubject: false },
    { userId: 'u7', name: 'Michael', value: 519, vsMedian: -0.2, rank: 7, parts: { self: 214, bidder: 305 }, isSubject: true },
  ] },
  trend: { unit: 'week', buckets: [{ label: 'Nov 3', you: 100, median: 120 }] },
  notEnoughData: false, definitions: ['Bids = self + bidder'], ...o,
});

describe('StatsFrame', () => {
  it('renders header with rank and vs median', () => {
    render(<StatsFrame view={view()} canPick={false} onPick={() => {}} />);
    expect(screen.getAllByText('519').length).toBe(2);
    expect(screen.getByText('of 9')).toBeTruthy();
    expect(screen.getByText('▼ 20% below median')).toBeTruthy();
    expect(screen.getByText('Team median')).toBeTruthy();
    expect(screen.getByText('646')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('team 50 · target 54')).toBeTruthy();
  });

  it('would rank when subject is outside the team', () => {
    const v = view();
    v.headline[0] = { ...v.headline[0], of: 10, rank: 10 };
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('would rank 10 of 10')).toBeTruthy();
  });

  it('range bar places you and median', () => {
    render(<StatsFrame view={view()} canPick={false} onPick={() => {}} />);
    const dot = screen.getByTestId('range-you');
    expect(parseFloat(dot.style.left)).toBeCloseTo(((519 - 482) / (789 - 482)) * 100, 1);
    expect(parseFloat(screen.getByTestId('range-median').style.left)).toBeCloseTo(((646 - 482) / 307) * 100, 1);
    expect(screen.getByText('median')).toBeTruthy();
  });

  it('not enough data state', () => {
    render(<StatsFrame view={view({ notEnoughData: true, tips: [] })} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('Not enough data yet — check back after a few working days.')).toBeTruthy();
  });

  it('no tips state', () => {
    render(<StatsFrame view={view({ tips: [] })} canPick={false} onPick={() => {}} />);
    expect(screen.getByText("Nothing stands out — you're in line with the team.")).toBeTruthy();
  });

  it('everyone highlights subject and only admins can click', () => {
    const onPick = vi.fn();
    const { rerender } = render(<StatsFrame view={view()} canPick={false} onPick={onPick} />);
    expect(screen.queryByRole('button', { name: 'Justin' })).toBeNull();
    expect(screen.getByTestId('everyone-u7').getAttribute('data-subject')).toBe('true');
    rerender(<StatsFrame view={view()} canPick onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Justin' }));
    expect(onPick).toHaveBeenCalledWith('u1');
  });

  it('definitions collapsed by default', () => {
    render(<StatsFrame view={view()} canPick={false} onPick={() => {}} />);
    const d = screen.getByText('How these are counted').closest('details')!;
    expect(d.open).toBe(false);
    expect(screen.getByText('Bids = self + bidder')).toBeTruthy();
  });

  it('trend heading names the unit', () => {
    render(<StatsFrame view={view({ trend: { unit: 'day', buckets: [] } })} canPick={false} onPick={() => {}} />);
    expect(screen.getByText(/Daily, you vs team median/)).toBeTruthy();
  });

  it('above median is green, below is red, zero is empty in everyone', () => {
    const v = view();
    v.headline[0] = { ...v.headline[0], vsMedian: 0.12 };
    v.everyone.rows[0].vsMedian = 0;
    v.everyone.rows[1].vsMedian = 0.12;
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    const up = screen.getByText('▲ 12% above median');
    expect(up.className).toContain('text-green');
    expect(screen.getByText('+12%').className).toContain('text-green');
    expect(screen.queryByText('median', { selector: 'span.text-xs' })).toBeNull();
  });

  it('empty team (n = 0, null stats) renders without crashing', () => {
    const nul = { median: null, p25: null, p75: null, min: null, max: null, n: 0 };
    const v = view({ tips: [], everyone: { rowKind: 'person', metric: 'bids', rows: [] } });
    v.headline[0] = { ...v.headline[0], value: 0, team: nul, rank: 1, of: 1, vsMedian: null };
    v.headline[2] = { ...v.headline[2], team: nul };
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByLabelText('You versus team range')).toBeNull();
  });

  it('subject outside the team with no tips says no bids, not in line', () => {
    const v = view({ tips: [] });
    v.headline[0] = { ...v.headline[0], value: 0, of: 10, rank: 10 };
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('No bids in this period.')).toBeTruthy();
    expect(screen.queryByText(/in line with the team/)).toBeNull();
  });

  const extra = (o: Partial<StatsView['headline'][number]>) => ({ key: 'x', label: 'Extra', value: 5, format: 'count' as const, team: null, rank: 1, of: 1, vsMedian: null, higherIsBetter: true, note: 'extra note', ...o });

  it('header renders any extra entries generically', () => {
    const v = view();
    v.headline = [v.headline[0], extra({ key: 'whatever', label: 'Mystery', value: 1234 }), extra({ key: 'other', label: 'Other', note: 'o note' })];
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('Mystery')).toBeTruthy();
    expect(screen.getByText('1,234')).toBeTruthy();
    expect(screen.getByText('o note')).toBeTruthy();
  });

  it('per100 and pct formats', () => {
    const t = { ...team, median: 2.5 };
    const v = view({ tab: 'interviews', everyone: { rowKind: 'person', metric: 'per100', rows: [] } });
    v.headline = [
      extra({ key: 'per100', label: 'Interviews per 100 bids', value: 3.2, format: 'per100', team: t }),
      extra({ key: 'reach', label: 'Reached tech', value: 0.256, format: 'pct' }),
    ];
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('3.2')).toBeTruthy();
    expect(screen.getByText('Team median').parentElement!.textContent).toContain('2.5 per 100 bids');
    expect(screen.getByText('2.5')).toBeTruthy();
    expect(screen.getByText('26%')).toBeTruthy();
  });

  it('null value shows — and everyone marks unranked rows', () => {
    const v = view({ everyone: { rowKind: 'person', metric: 'per100', rows: [
      { userId: 'a', name: 'Ann', value: 4.1, vsMedian: null, rank: null, parts: {}, isSubject: false },
      { userId: 'b', name: 'Bob', value: null, vsMedian: null, rank: null, parts: {}, isSubject: false },
    ] } });
    v.headline = [extra({ key: 'reach', label: 'Reached tech', value: null, format: 'pct' })];
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getAllByText('not ranked').length).toBe(2);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('4.1')).toBeTruthy();
  });

  const interviews = () => {
    const v = view({ tab: 'interviews', tips: [] });
    v.headline = [
      { key: 'per100', label: 'Interviews per 100 bids', value: 20, format: 'per100', team: { ...team, median: 4, n: 4 }, rank: null, of: 4, vsMedian: null, higherIsBetter: true, note: '2 interviews from 10 bids' },
      { key: 'rank', label: 'Your rank', value: null, format: 'rank', team: null, rank: null, of: 4, vsMedian: null, higherIsBetter: false, note: 'needs 30 bids' },
    ];
    v.everyone = { rowKind: 'person', metric: 'per100', rows: [
      { userId: 'u1', name: 'Ana', value: 4, vsMedian: 0, rank: 1, parts: { self: 4, caller: 0 }, isSubject: false },
      { userId: 'u9', name: 'Low', value: 20, vsMedian: null, rank: null, parts: { self: 2, caller: 0 }, isSubject: true },
    ] };
    return v;
  };

  it('rank cell shows the note when not ranked', () => {
    render(<StatsFrame view={interviews()} canPick={false} onPick={() => {}} />);
    const cell = screen.getByText('Your rank').parentElement!;
    expect(cell.textContent).toContain('needs 30 bids');
    expect(cell.textContent).not.toContain('— of');
  });

  it('everyone bars scale to ranked rows only and cap at 100%', () => {
    render(<StatsFrame view={interviews()} canPick={false} onPick={() => {}} />);
    const bar = (id: string) => screen.getByTestId(`everyone-${id}`).querySelector('span.h-2\\.5') as HTMLElement;
    expect(bar('u1').style.width).toBe('100%');
    expect(bar('u9').style.width).toBe('100%');
  });

  it('everyone heading is human', () => {
    const { unmount } = render(<StatsFrame view={interviews()} canPick={false} onPick={() => {}} />);
    expect(screen.getByText(/interviews per 100 bids, ranked/)).toBeTruthy();
    expect(screen.queryByText(/per100/)).toBeNull();
    unmount();
    const v = interviews();
    v.everyone.rows.forEach((r) => { r.rank = null; });
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.queryByText(', ranked', { exact: false, selector: 'h3 span' })).toBeNull();
  });

  it('empty-tips text outside the team fits the tab', () => {
    const v = interviews();
    v.headline[0] = { ...v.headline[0], of: 5, rank: 5 };
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('No activity in this period.')).toBeTruthy();
  });

  it('team median uses the per-100 unit too', () => {
    render(<StatsFrame view={interviews()} canPick={false} onPick={() => {}} />);
    const cell = screen.getByText('Team median').parentElement!;
    expect(cell.textContent).toContain('4.0 per 100 bids');
  });
});

describe('StatsFrame profiles', () => {
  const pv = (o: Partial<StatsView> = {}): StatsView => view({
    tab: 'profiles',
    everyone: { rowKind: 'profile', metric: 'per100', rows: [
      { userId: 'p1', name: 'Acme Dev', region: 'EU', value: 4.2, vsMedian: 0.1, rank: 1, parts: { self: 20, bidder: 20 }, isSubject: false },
    ] },
    ...o,
  });

  it('profile rows are not clickable for admins and show a region tag', () => {
    render(<StatsFrame view={pv()} canPick onPick={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Acme Dev' })).toBeNull();
    expect(screen.getByText('EU')).toBeTruthy();
    expect(screen.getByText(/interviews per 100 bids by profile/)).toBeTruthy();
  });

  it('null trend hides the trend card', () => {
    render(<StatsFrame view={pv({ trend: null })} canPick={false} onPick={() => {}} />);
    expect(screen.queryByText(/Trend/)).toBeNull();
  });

  it('profiles empty state', () => {
    render(<StatsFrame view={pv({ everyone: { rowKind: 'profile', metric: 'per100', rows: [] } })} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('No profile activity in this period.')).toBeTruthy();
  });

  it('lower-is-better headline below median is green', () => {
    const v = view();
    v.headline[0] = { ...v.headline[0], format: 'count', higherIsBetter: false, vsMedian: -0.3 };
    render(<StatsFrame view={v} canPick={false} onPick={() => {}} />);
    expect(screen.getByText('▼ 30% below median').className).toContain('text-green-600');
  });
});
