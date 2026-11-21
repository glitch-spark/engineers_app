// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItemRow from './ItemRow';
import type { DayItem } from '../../api/endpoints';

afterEach(cleanup);

const item = { id: 'r2', text: 'Outreach', kind: 'count', target: 50, archived: false, scope: 'routine', result: null } as unknown as DayItem;

function setup(result: { done: boolean; value: number | null }) {
  const onChange = vi.fn();
  render(<ul><ItemRow item={item} result={result} disabled={false} onChange={onChange} /></ul>);
  return onChange;
}

describe('ItemRow count', () => {
  it('ticking a count keeps the typed number', () => {
    const onChange = setup({ done: false, value: 31 });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenLastCalledWith({ done: true, value: 31 });
  });

  it('typing the target ticks it', () => {
    const onChange = setup({ done: false, value: 31 });
    fireEvent.change(screen.getByLabelText('Outreach'), { target: { value: '50' } });
    expect(onChange).toHaveBeenLastCalledWith({ done: true, value: 50 });
  });

  it('typing below target keeps an existing tick', () => {
    const onChange = setup({ done: true, value: 50 });
    fireEvent.change(screen.getByLabelText('Outreach'), { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith({ done: true, value: 10 });
  });

  it('done row is struck through', () => {
    setup({ done: true, value: 50 });
    expect(screen.getByText('Outreach').className).toContain('line-through');
  });
});

describe('ItemRow: a counted item', () => {
  const count = { id: 'c1', text: 'Send emails', kind: 'count', scope: 'routine', target: 50, archived: false, result: null } as never;
  const show = (value: number | null, done = false) => render(
    <ul><ItemRow item={count} result={{ done, value }} disabled={false} onChange={() => {}} /></ul>,
  );

  it('keeps the number and its target together in one box, right after the text, with a 0 placeholder', () => {
    show(null);
    const box = screen.getByRole('spinbutton', { name: 'Send emails' });
    const group = box.closest('[data-count-box]')!;
    expect(group.textContent).toContain('/ 50');
    expect(box.getAttribute('placeholder')).toBe('0');
    expect(screen.getByText('Send emails').nextElementSibling).toBe(group);
  });

  it('shows how far along the number is, and green once the target is reached', () => {
    const { unmount } = show(20);
    let bar = document.querySelector('[data-count-bar]') as HTMLElement;
    expect(bar.style.width).toBe('40%');
    expect(bar.className).not.toContain('green');
    unmount();
    show(60, true);
    bar = document.querySelector('[data-count-bar]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
    expect(bar.className).toContain('green');
  });

describe('ItemRow log', () => {
  const log = { id: 'l1', text: 'Profile review', kind: 'log', target: null, archived: false, scope: 'routine', result: null } as unknown as DayItem;
  const profiles = [{ id: 'p1', name: 'Anna', region: null, archived: false }];
  const renderLog = (entries: { profileId: string | null; note: string }[]) => {
    const onChange = vi.fn();
    render(<ul><ItemRow item={log} result={{ done: entries.length > 0, value: null, entries }} profiles={profiles} disabled={false} onChange={onChange} /></ul>);
    return onChange;
  };

  it('a log item is done when it has an entry with a note', () => {
    const onChange = renderLog([{ profileId: 'p1', note: '' }]);
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: 'New title' } });
    expect(onChange).toHaveBeenLastCalledWith({ done: true, value: null, entries: [{ profileId: 'p1', note: 'New title' }] });
    expect(screen.getByRole('checkbox')).toHaveProperty('disabled', true);
  });

  it('removing the last entry makes it not done', () => {
    const onChange = renderLog([{ profileId: 'p1', note: 'x' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    expect(onChange).toHaveBeenLastCalledWith({ done: false, value: null, entries: [] });
  });
});
});
