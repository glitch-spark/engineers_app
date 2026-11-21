// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TeamList from './TeamList';

afterEach(cleanup);

const people = [
  { userId: 'u1', name: 'Yuari', bids: { done: 183, target: 270 }, todos: { done: 1, total: 4 }, pending: 28, state: 'red' },
  { userId: 'u2', name: 'Puma', bids: { done: 186, target: 200 }, todos: { done: 1, total: 3 }, pending: 10, state: 'amber' },
  { userId: 'u3', name: 'Michael', bids: { done: 281, target: 270 }, todos: { done: 3, total: 3 }, pending: 0, state: 'green' },
  { userId: 'u4', name: 'Zed', bids: { done: 12, target: null }, todos: { done: 0, total: 0 }, pending: 1, state: 'green' },
] as const;
const show = (picked = 'u2') => {
  const onPick = vi.fn();
  render(<TeamList people={[...people]} picked={picked} onPick={onPick} />);
  return onPick;
};
const rows = () => within(screen.getByRole('navigation', { name: 'People' })).getAllByRole('button');

describe('TeamList', () => {
  it('lists people in the order sent, each with a named dot, the pending badge, the bids line and a bar', () => {
    show();
    const [yuari, puma, michael] = rows();
    expect(rows().map((r) => within(r).getByText(/^[A-Z][a-z]+$/).textContent)).toEqual(['Yuari', 'Puma', 'Michael', 'Zed']);

    expect(within(yuari).getByRole('img', { name: 'Something overdue' }).className).toContain('bg-red-500');
    expect(within(yuari).getByLabelText('28 pending').textContent).toBe('28');
    expect(within(yuari).getByText('183 / 270 bids · 1 of 4 to-dos')).toBeTruthy();
    const bar = within(yuari).getByRole('progressbar', { name: 'Yuari: bids today' });
    expect(bar.getAttribute('aria-valuenow')).toBe('68');
    expect(bar.firstElementChild?.className).toContain('bg-amber-500');

    expect(within(puma).getByRole('img', { name: 'Behind today' }).className).toContain('bg-amber-500');
    expect(within(michael).getByRole('img', { name: 'On track' }).className).toContain('bg-success-500');
    expect(within(michael).getByLabelText('0 pending').className).not.toContain('red');
    expect(within(yuari).getByLabelText('28 pending').className).toContain('red');
    const full = within(michael).getByRole('progressbar');
    expect(full.getAttribute('aria-valuenow')).toBe('100');
    expect(full.firstElementChild?.className).toContain('bg-success-500');
  });

  it('a person with no bids target or to-dos: only what there is, no bar', () => {
    show();
    const zed = rows()[3];
    expect(within(zed).getByText('12 bids')).toBeTruthy();
    expect(within(zed).queryByRole('progressbar')).toBeNull();
  });

  it('marks the picked row for screen readers and picks on click; rows are buttons, so the keyboard reaches them', () => {
    const onPick = show('u2');
    expect(rows().map((r) => r.getAttribute('aria-current'))).toEqual([null, 'true', null, null]);
    fireEvent.click(rows()[2]);
    expect(onPick).toHaveBeenCalledWith('u3');
    expect(rows().every((r) => r.tagName === 'BUTTON')).toBe(true);
  });

  it('the list shows from the md width up; under it the Viewing dropdown with previous / next', () => {
    const onPick = show('u2');
    expect(screen.getByRole('navigation', { name: 'People' }).className).toMatch(/\bhidden md:block\b/);
    const select = screen.getByLabelText('Viewing') as HTMLSelectElement;
    expect(select.closest('.md\\:hidden')).toBeTruthy();
    expect(select.value).toBe('u2');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(
      ['Yuari · 28 pending', 'Puma · 10 pending', 'Michael · 0 pending', 'Zed · 1 pending'],
    );
    expect(screen.getByText('2 of 4')).toBeTruthy();
    fireEvent.change(select, { target: { value: 'u4' } });
    expect(onPick).toHaveBeenLastCalledWith('u4');
    fireEvent.click(screen.getByRole('button', { name: 'Previous person' }));
    expect(onPick).toHaveBeenLastCalledWith('u1');
    fireEvent.click(screen.getByRole('button', { name: 'Next person' }));
    expect(onPick).toHaveBeenLastCalledWith('u3');
  });

  it('previous is off on the first person and next on the last', () => {
    show('u1');
    expect((screen.getByRole('button', { name: 'Previous person' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next person' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    show('u4');
    expect((screen.getByRole('button', { name: 'Next person' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
