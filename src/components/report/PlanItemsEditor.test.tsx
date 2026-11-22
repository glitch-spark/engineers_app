// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PlanItemIn } from '../../api/endpoints';
import PlanItemsEditor from './PlanItemsEditor';

afterEach(cleanup);

function Harness({ initial, scope, spy }: { initial: PlanItemIn[]; scope: 'routine' | 'goal'; spy: (n: PlanItemIn[]) => void }) {
  const [items, setItems] = useState(initial);
  return <PlanItemsEditor items={items} scope={scope} onChange={(n) => { spy(n); setItems(n); }} />;
}

describe('PlanItemsEditor', () => {
  it('adds an item without an id', () => {
    const spy = vi.fn();
    render(<Harness initial={[]} scope="routine" spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(spy).toHaveBeenLastCalledWith([{ text: '', kind: 'check', target: null, archived: false }]);
  });

  it('a locked row has no inputs and no archive button; unlocked rows stay editable', () => {
    const items: PlanItemIn[] = [
      { id: 'a', text: 'Admin one', kind: 'check', target: null, archived: false, addedBy: 'admin' },
      { id: 'b', text: 'Mine', kind: 'check', target: null, archived: false, addedBy: 'self' },
    ];
    render(<PlanItemsEditor items={items} scope="routine" onChange={() => {}} lockedFor={(i) => i.addedBy !== 'self'} />);
    expect(screen.getByText('Admin one')).toBeTruthy();
    expect(screen.getAllByLabelText(/^routine item \d+$/i)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /archive/i })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Set by your admin' })).toBeTruthy();
    expect(screen.getByLabelText('Routine item 1')).toBeTruthy();
    const spy = vi.fn();
    cleanup();
    render(<PlanItemsEditor items={items} scope="routine" onChange={spy} lockedFor={(i) => i.addedBy !== 'self'} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add my item' }));
    expect(spy.mock.lastCall![0][2]).toMatchObject({ text: '', addedBy: 'self' });
  });

  it('without lockedFor the button reads "Add item" and the new row has no addedBy', () => {
    const spy = vi.fn();
    render(<PlanItemsEditor items={[]} scope="routine" onChange={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(spy.mock.lastCall![0][0]).not.toHaveProperty('addedBy');
  });

  it('sets kind and target; target only for count / hours', () => {
    const spy = vi.fn();
    render(<Harness initial={[{ text: 'Reply', kind: 'check', target: null, archived: false }]} scope="routine" spy={spy} />);
    expect(screen.queryByLabelText(/target/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'count' } });
    fireEvent.change(screen.getByLabelText(/target/i), { target: { value: '5' } });
    expect(spy).toHaveBeenLastCalledWith([{ text: 'Reply', kind: 'count', target: 5, archived: false }]);
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'check' } });
    expect(spy).toHaveBeenLastCalledWith([{ text: 'Reply', kind: 'check', target: null, archived: false }]);
  });

  it('labels the target by scope', () => {
    const items: PlanItemIn[] = [{ id: 'a', text: 'x', kind: 'hours', target: 2, archived: false }];
    const { unmount } = render(<Harness initial={items} scope="routine" spy={vi.fn()} />);
    expect(screen.getByText('per day')).toBeTruthy();
    unmount();
    render(<Harness initial={items} scope="goal" spy={vi.fn()} />);
    expect(screen.getByText('this week')).toBeTruthy();
  });

  it('archives a saved item (kept, flagged) and drops an unsaved one', () => {
    const spy = vi.fn();
    render(<Harness
      initial={[{ id: 'a', text: 'Saved', kind: 'check', target: null, archived: false }, { text: 'New', kind: 'check', target: null, archived: false }]}
      scope="goal" spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: /archive .* item 2/i }));
    expect(spy).toHaveBeenLastCalledWith([{ id: 'a', text: 'Saved', kind: 'check', target: null, archived: false }]);
    fireEvent.click(screen.getByRole('button', { name: /archive .* item 1/i }));
    expect(spy).toHaveBeenLastCalledWith([{ id: 'a', text: 'Saved', kind: 'check', target: null, archived: true }]);
    expect(screen.queryByDisplayValue('Saved')).toBeNull();
  });

  it('the kind select offers Log and a log item has no target input', () => {
    const spy = vi.fn();
    render(<Harness initial={[{ text: 'Review', kind: 'count', target: 5, archived: false }]} scope="routine" spy={spy} />);
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'log' } });
    expect(spy).toHaveBeenLastCalledWith([{ text: 'Review', kind: 'log', target: null, archived: false }]);
    expect(screen.queryByLabelText(/target/i)).toBeNull();
  });
});
