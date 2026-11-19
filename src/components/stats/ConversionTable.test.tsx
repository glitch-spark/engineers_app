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
});
