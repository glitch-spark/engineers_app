// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SearchFilter from './SearchFilter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const box = () => screen.getByRole('searchbox') as HTMLInputElement;
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe('SearchFilter', () => {
  it('reports typing once, 300 ms after the last keystroke', () => {
    const onChange = vi.fn();
    render(<SearchFilter value="" onChange={onChange} placeholder="Search interviews…" />);
    fireEvent.change(box(), { target: { value: 'a' } });
    wait(200);
    fireEvent.change(box(), { target: { value: 'ac' } });
    wait(299);
    expect(onChange).not.toHaveBeenCalled();
    wait(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ac');
  });

  it('clears at once with the x button and cancels the pending change', () => {
    const onChange = vi.fn();
    render(<SearchFilter value="" onChange={onChange} placeholder="Search…" />);
    fireEvent.change(box(), { target: { value: 'acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(box().value).toBe('');
    wait(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clears at once with Esc', () => {
    const onChange = vi.fn();
    render(<SearchFilter value="acme" onChange={onChange} placeholder="Search…" />);
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
    expect(box().value).toBe('');
  });

  it('follows the value prop when it changes from outside', () => {
    function Harness() {
      const [q, setQ] = useState('acme');
      return (
        <>
          <SearchFilter value={q} onChange={setQ} placeholder="Search…" />
          <button type="button" onClick={() => setQ('')}>
            reset
          </button>
        </>
      );
    }
    render(<Harness />);
    expect(box().value).toBe('acme');
    fireEvent.click(screen.getByText('reset'));
    expect(box().value).toBe('');
  });

  it('does not clobber what is being typed when its own change comes back as the value', () => {
    function Harness() {
      const [q, setQ] = useState('');
      return <SearchFilter value={q} onChange={setQ} placeholder="Search…" />;
    }
    render(<Harness />);
    fireEvent.change(box(), { target: { value: 'ab' } });
    wait(300);
    fireEvent.change(box(), { target: { value: 'abc' } });
    expect(box().value).toBe('abc');
    wait(300);
    expect(box().value).toBe('abc');
  });

  it('links an optional description to the box for screen readers', () => {
    render(<SearchFilter value="" onChange={vi.fn()} placeholder="Search…" description="Every word must match." />);
    expect(box().getAttribute('aria-describedby')).toBeTruthy();
    expect(box().getAttribute('aria-describedby')).toBe(screen.getByText('Every word must match.').id);
    expect(screen.getByText('Every word must match.').className).toContain('sr-only');
  });

  it('has no aria-describedby without a description', () => {
    render(<SearchFilter value="" onChange={vi.fn()} placeholder="Search…" />);
    expect(box().hasAttribute('aria-describedby')).toBe(false);
  });
});
