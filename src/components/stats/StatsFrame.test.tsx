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
  everyone: { metric: 'bids', rows: [
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
});
