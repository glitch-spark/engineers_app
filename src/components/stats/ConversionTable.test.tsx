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
});
