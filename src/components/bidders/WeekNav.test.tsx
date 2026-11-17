// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WeekNav from './WeekNav';

afterEach(cleanup);

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('WeekNav', () => {
  it('WeekNav steps from the shown days', () => {
    const onChange = vi.fn();
    render(<WeekNav shown={{ first: '2026-11-23', last: '2026-11-29' }} label="Week ending Sun Nov 29" isCurrent onChange={onChange} />);
    click('Previous week');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-22');
    cleanup();

    // The 8-day week across the switch: back is the day before it, forward the day after it (the next week's first).
    render(<WeekNav shown={{ first: '2026-11-15', last: '2026-11-22' }} label="Week ending Sun Nov 22" isCurrent={false} onChange={onChange} />);
    click('Previous week');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-14');
    click('Next week');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-23');
    cleanup();

    // The 1-day short week: back is the week ending Nov 14, forward the week starting Nov 16 (never skipped).
    render(<WeekNav shown={{ first: '2026-11-15', last: '2026-11-15' }} label="Week ending Sun Nov 15" isCurrent={false} onChange={onChange} />);
    click('Previous week');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-14');
    click('Next week');
    expect(onChange).toHaveBeenLastCalledWith('2026-11-16');
  });

  it('has nothing to step while the week loads', () => {
    render(<WeekNav shown={null} label={null} isCurrent={false} onChange={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Previous week' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next week' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
