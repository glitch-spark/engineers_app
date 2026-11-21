// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LogEntries from './LogEntries';
import type { LogEntry, PlanProfile } from '../../api/endpoints';

afterEach(cleanup);

const profiles: PlanProfile[] = [
  { id: 'p1', name: 'Anna', region: null, archived: false },
  { id: 'p2', name: 'Boris', region: null, archived: false },
  { id: 'p3', name: 'Old', region: null, archived: true },
];

function setup(entries: LogEntry[]) {
  const onChange = vi.fn();
  render(<LogEntries entries={entries} profiles={profiles} disabled={false} onChange={onChange} />);
  return onChange;
}

describe('LogEntries', () => {
  it('adds an entry for the first unused profile', () => {
    const onChange = setup([{ profileId: 'p1', note: 'x' }]);
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    expect(onChange).toHaveBeenLastCalledWith([{ profileId: 'p1', note: 'x' }, { profileId: 'p2', note: '' }]);
  });

  it('falls back to the first profile when all are used', () => {
    const onChange = setup([{ profileId: 'p1', note: 'x' }, { profileId: 'p2', note: 'y' }]);
    fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
    expect(onChange.mock.calls[0][0][2]).toEqual({ profileId: 'p1', note: '' });
  });

  it('edits a note', () => {
    const onChange = setup([{ profileId: 'p1', note: '' }]);
    fireEvent.change(screen.getByLabelText('What changed 1'), { target: { value: 'New title' } });
    expect(onChange).toHaveBeenLastCalledWith([{ profileId: 'p1', note: 'New title' }]);
  });

  it('removes an entry', () => {
    const onChange = setup([{ profileId: 'p1', note: 'a' }, { profileId: 'p2', note: 'b' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove entry 1' }));
    expect(onChange).toHaveBeenLastCalledWith([{ profileId: 'p2', note: 'b' }]);
  });

  it('shows an entry without a profile as text only', () => {
    setup([{ profileId: null, note: 'mine' }]);
    expect(screen.queryByLabelText('Profile 1')).toBeNull();
    expect(screen.getByLabelText('What changed 1')).toHaveProperty('value', 'mine');
  });

  it('stops at 20 entries', () => {
    setup(Array.from({ length: 20 }, () => ({ profileId: 'p1', note: 'x' })));
    expect(screen.queryByRole('button', { name: /add profile/i })).toBeNull();
  });

  it('archived profiles are offered only when already picked', () => {
    setup([{ profileId: 'p3', note: 'x' }, { profileId: 'p1', note: 'y' }]);
    const names = (label: string) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.text);
    expect(names('Profile 1')).toContain('Old');
    expect(names('Profile 2')).not.toContain('Old');
  });
});
