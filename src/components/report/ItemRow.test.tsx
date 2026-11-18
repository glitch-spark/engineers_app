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
