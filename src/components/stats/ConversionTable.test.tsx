// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConversionTable from './ConversionTable';

afterEach(cleanup);
const TIP = 'Only 12 matured bids — this rate can swing a lot.';

describe('ConversionTable', () => {
  it('⚠ toggles an inline explanation under the row; title and description for hover / screen readers', () => {
    render(<ConversionTable title="By bidder" rows={[{ key: 'b', label: 'Ana', bids: 20, matured: 12, interviews: 1, rate: 8.3, few: true }]} />);
    const warn = screen.getByRole('button', { name: /swing a lot/ });
    expect(warn.getAttribute('title')).toBe(TIP);
    expect(document.getElementById(warn.getAttribute('aria-describedby')!)?.textContent).toBe(TIP);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(warn);
    expect(screen.getByRole('note').textContent).toBe(TIP);
    expect(warn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(warn);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('few by expected interviews at the team rate says so; few by matured keeps the bids copy', () => {
    render(<ConversionTable title="By job site" teamRate={0.5} rows={[
      { key: 'g', label: 'Greenhouse', bids: 400, matured: 300, interviews: 2, rate: 0.7, few: true, fewReason: 'expected' },
      { key: 'l', label: 'Lever', bids: 40, matured: 29, interviews: 1, rate: 3.4, few: true, fewReason: 'matured' },
    ]} />);
    const exp = 'Only about 1.5 interviews expected from 300 matured bids at the team rate — this rate can swing a lot.';
    fireEvent.click(screen.getByRole('button', { name: /about 1\.5 interviews/ }));
    expect(screen.getByRole('note').textContent).toBe(exp);
    expect(screen.getByRole('button', { name: /Only 29 matured bids/ }).getAttribute('title')).toBe(
      'Only 29 matured bids — this rate can swing a lot.');
  });

  it('starts with every note closed, also for rows without a key (unknown / no score)', () => {
    render(<ConversionTable title="By resume score" rows={[
      { key: null as unknown as string, label: 'No score', bids: 3341, matured: 1924, interviews: 0, rate: 0, few: false },
      { key: null as unknown as string, label: 'Unknown', bids: 0, matured: 0, interviews: 0, rate: null, few: true, fewReason: 'matured' },
    ]} />);
    expect(screen.queryByText(/this rate can swing a lot/)).toBeNull();
  });

  describe('expandable Other sites', () => {
    const m = (key: string, bids: number) => ({ key, label: key, bids, matured: 40, interviews: 2, rate: 5, few: false });
    const rows = (more = 0) => [
      { key: 'l', label: 'Lever', bids: 40, matured: 40, interviews: 2, rate: 5, few: false },
      { key: 'other', label: 'Other sites', bids: 9, matured: 40, interviews: 2, rate: 5, few: false,
        members: [m('a.io', 6), { ...m('b.io', 3), matured: 12, few: true, fewReason: 'matured' as const }], moreMembers: more, memberCount: 2 + more },
    ];

    it('is collapsed by default, then expands and collapses', () => {
      render(<ConversionTable title="By job site" rows={rows()} />);
      const btn = screen.getByRole('button', { name: /Other sites \(2 sites\)/ });
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('a.io')).toBeNull();
      fireEvent.click(btn);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('a.io')).toBeTruthy();
      expect(screen.getByRole('button', { name: /swing a lot/ })).toBeTruthy();
      fireEvent.click(btn);
      expect(screen.queryByText('a.io')).toBeNull();
    });

    it('shows "…and N more sites" when capped, and nothing otherwise', () => {
      const { unmount } = render(<ConversionTable title="By job site" rows={rows(623)} />);
      fireEvent.click(screen.getByRole('button', { name: /Other sites \(625 sites\)/ }));
      expect(screen.getByText('…and 623 more sites')).toBeTruthy();
      unmount();
      render(<ConversionTable title="By job site" rows={rows()} />);
      fireEvent.click(screen.getByRole('button', { name: /Other sites/ }));
      expect(screen.queryByText(/more sites/)).toBeNull();
    });
  });
  it('rate bar per row relative to the max rate, team tick, ★ / ⚠ from mark, few rows muted', () => {
    render(<ConversionTable title="By resume score" teamRate={0.6} rows={[
      { key: '80', label: '80+', bids: 1185, matured: 900, interviews: 9, rate: 1.5, few: false, mark: 'best' },
      { key: '65', label: '65–79', bids: 812, matured: 600, interviews: 3, rate: 0.5, few: false, mark: null },
      { key: '50', label: '50–64', bids: 328, matured: 200, interviews: 0, rate: 0, few: true, fewReason: 'expected' },
      { key: 'x', label: 'Tiny', bids: 900, matured: 800, interviews: 0, rate: 0, few: false, mark: 'weak' },
    ]} />);
    const row = (label: string) => screen.getByText(label).closest('tr')!;
    const fill = (label: string) => (row(label).querySelector('[data-bar="fill"]') as HTMLElement).style.width;
    expect(fill('80+')).toBe('100%');
    expect(fill('65–79')).toBe('33.33%');
    expect(fill('50–64')).toBe('0%');
    expect((row('80+').querySelector('[data-bar="team"]') as HTMLElement).style.left).toBe('40%');
    expect(screen.getByRole('img', { name: 'Best group' }).textContent).toBe('★');
    expect(row('80+').contains(screen.getByRole('img', { name: 'Best group' }))).toBe(true);
    expect(row('Tiny').contains(screen.getByRole('img', { name: 'Weakest group' }))).toBe(true);
    expect(screen.getAllByRole('img', { name: /group$/ })).toHaveLength(2);
    expect(row('50–64').className).toContain('text-muted');
    expect(row('80+').className).not.toContain('text-muted');
  });

  it('no team tick or legend without a team rate; no bar for a null rate', () => {
    render(<ConversionTable title="T" rows={[{ key: 'a', label: 'A', bids: 1, matured: 0, interviews: 0, rate: null, few: true, fewReason: 'matured' }]} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Bids', 'Matured', 'Interviews', 'Rate']);
    expect(document.querySelector('[data-bar]')).toBeNull();
  });
});

describe('ConversionTable rate bars', () => {
  afterEach(cleanup);
  const grp = (key: string, label: string, rate: number | null, o = {}) =>
    ({ key, label, bids: 100, matured: 100, interviews: 1, rate, few: false, ...o });

  it('No tracked bid shows no rate or bar, and does not stretch the scale', () => {
    render(<ConversionTable title="Self vs bidder" teamRate={0.9} rows={[
      grp('self', 'Self', 2.3), grp('bidder', 'Bidder', 0.2), grp('unknown', 'No tracked bid', 78.8),
    ]} />);
    const unknown = screen.getByText('No tracked bid').closest('tr')!;
    expect(unknown.querySelector('[data-bar="fill"]')).toBeNull();
    expect(unknown.textContent).toContain('known only from interviews');
    expect(unknown.textContent).not.toContain('78.8%');
    const self = screen.getByText('Self').closest('tr')!.querySelector('[data-bar="fill"]') as HTMLElement;
    expect(self.style.width).toBe('100%'); // scaled to the highest real rate, not 78.8
  });

  it('plain Rate header and a legend naming the team rate', () => {
    render(<ConversionTable title="By job site" teamRate={0.9} rows={[grp('a', 'Ashby', 0.5)]} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Group', 'Bids', 'Matured', 'Interviews', 'Rate']);
    expect(screen.getByText('Bar = rate · line = team rate (0.9%)')).toBeTruthy();
  });
});
