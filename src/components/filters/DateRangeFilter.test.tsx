// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DateRangeFilter, { resolveRange, type DateRangeValue } from './DateRangeFilter';
import { presetOptions, type DatePreset } from '../../lib/dateRange';

afterEach(cleanup);

// 2026-11-14 is a Saturday: this week is Nov 9-15, last week Nov 2-8.
const TODAY = '2026-11-14';
const PRESETS = presetOptions();

/** Keeps the value in state so repeated stepping works the way a page would drive it. */
function Harness({
  initial,
  allowFuture = false,
  presets = PRESETS,
}: {
  initial: DateRangeValue;
  allowFuture?: boolean;
  presets?: typeof PRESETS;
}) {
  const [value, setValue] = useState(initial);
  return <DateRangeFilter value={value} onChange={setValue} presets={presets} allowFuture={allowFuture} today={TODAY} />;
}

const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const prev = () => fireEvent.click(button('Previous period'));
const next = () => fireEvent.click(button('Next period'));
const select = () => screen.getByLabelText('Date range') as HTMLSelectElement;
const label = () => document.querySelector('[aria-live="polite"]')?.textContent;

describe('DateRangeFilter', () => {
  it('shows the preset and its real dates, clipped to today when the future is not allowed', () => {
    render(<Harness initial={{ preset: 'this_week' }} />);
    expect(select().value).toBe('this_week');
    expect(label()).toBe('Nov 9–14, 2026');
  });

  it('steps back to last week, disables › at the current period, then steps forward again', () => {
    render(<Harness initial={{ preset: 'this_week' }} />);
    expect(button('Next period').disabled).toBe(true);
    prev();
    expect(select().value).toBe('last_week');
    expect(label()).toBe('Nov 2–8, 2026');
    next();
    expect(select().value).toBe('this_week');
    expect(label()).toBe('Nov 9–14, 2026');
  });

  it('shows a stepped range that matches no preset as Custom with its real dates', () => {
    render(<Harness initial={{ preset: 'last_week' }} />);
    prev();
    expect(select().value).toBe('custom');
    expect(label()).toBe('Oct 26 – Nov 1, 2026');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-10-26');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-11-01');
  });

  it('keeps stepping by the preset unit after the range turns Custom', () => {
    render(<Harness initial={{ preset: 'last_week' }} />);
    prev();
    prev();
    expect(label()).toBe('Oct 19–25, 2026');
    next();
    next();
    expect(select().value).toBe('last_week');
  });

  it('steps a whole custom month by calendar months', () => {
    render(<Harness initial={{ preset: 'custom', from: '2026-09-01', to: '2026-09-30' }} />);
    prev();
    expect(label()).toBe('Aug 2026');
    next();
    next();
    expect(select().value).toBe('last_month');
  });

  it('clips a stepped range to today when the future is not allowed', () => {
    render(<Harness initial={{ preset: 'custom', from: '2026-11-04', to: '2026-11-10' }} />);
    next();
    expect(label()).toBe('Nov 11–14, 2026');
    expect(button('Next period').disabled).toBe(true);
  });

  it('goes to next week on a page that allows the future', () => {
    render(<Harness initial={{ preset: 'this_week' }} allowFuture presets={presetOptions({ before: ['next_week'] })} />);
    expect(label()).toBe('Nov 9–15, 2026');
    next();
    expect(select().value).toBe('next_week');
    expect(label()).toBe('Nov 16–22, 2026');
  });

  it('seeds the From and To inputs from the current range when Custom is picked', () => {
    const onChange = vi.fn();
    render(
      <DateRangeFilter value={{ preset: 'last_week' }} onChange={onChange} presets={PRESETS} allowFuture={false} today={TODAY} />,
    );
    fireEvent.change(select(), { target: { value: 'custom' } });
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', from: '2026-11-02', to: '2026-11-08' });
  });

  it('shows the validation message for a custom range', () => {
    render(<Harness initial={{ preset: 'custom', from: '2026-11-10', to: '2026-11-01' }} />);
    expect(screen.getByRole('alert').textContent).toBe('From must be on or before To.');
  });

  it('survives bad values from the URL without crashing or sending bad dates', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRangeFilter
        value={{ preset: 'custom', from: '2026-02-31', to: '2026-03-05' }}
        onChange={onChange}
        presets={PRESETS}
        allowFuture={false}
        today={TODAY}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Pick both dates.');
    expect(screen.queryByRole('button', { name: 'Previous period' })).toBeNull();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-06' } });
    expect(onChange).toHaveBeenCalledWith({ preset: 'custom', from: '', to: '2026-03-06' });

    rerender(
      <DateRangeFilter
        value={{ preset: 'nonsense' as DatePreset }}
        onChange={onChange}
        presets={PRESETS}
        allowFuture={false}
        today={TODAY}
      />,
    );
    expect(select().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Previous period' })).toBeNull();
  });

  it('lets a page with its own presets drive stepping and the label', () => {
    const onStep = vi.fn();
    const pay = [
      { value: 'this_pay_week', label: 'This pay week' },
      { value: 'custom', label: 'Custom' },
    ];
    render(
      <DateRangeFilter
        value={{ preset: 'this_pay_week' }}
        onChange={vi.fn()}
        presets={pay}
        allowFuture={false}
        today={TODAY}
        onStep={onStep}
        canStepForward={false}
        labelFor={() => 'Nov 6–12, 2026'}
      />,
    );
    expect(label()).toBe('Nov 6–12, 2026');
    prev();
    expect(onStep).toHaveBeenCalledWith(-1);
    expect(button('Next period').disabled).toBe(true);
  });
});

describe('resolveRange', () => {
  it('resolves presets, valid custom ranges and nothing else', () => {
    expect(resolveRange({ preset: 'last_week' }, TODAY, false)).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(resolveRange({ preset: 'custom', from: '2026-11-01', to: '2026-11-03' }, TODAY, false)).toEqual({
      from: '2026-11-01',
      to: '2026-11-03',
    });
    expect(resolveRange({ preset: 'custom', from: '2026-02-31', to: '2026-03-05' }, TODAY, false)).toBeNull();
    expect(resolveRange({ preset: 'custom' }, TODAY, false)).toBeNull();
    expect(resolveRange({ preset: 'all_time' }, TODAY, false)).toBeNull();
    expect(resolveRange({ preset: 'bogus' as DatePreset }, TODAY, false)).toBeNull();
  });
});
