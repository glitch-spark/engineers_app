// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BidsHelp from './BidsHelp';

afterEach(cleanup);

describe('BidsHelp', () => {
  it('is a button that opens the glossary on click, not on hover', () => {
    render(<BidsHelp />);
    const trigger = screen.getByRole('button', { name: 'What do these numbers mean?' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'What these numbers mean' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.textContent).toContain('Pending');
    expect(dialog.textContent).toContain('Sunday 6–8 pm');
    expect(dialog.querySelectorAll('dt')).toHaveLength(6);
    expect(dialog.textContent).toContain('Download it from More actions › Download Bid Track.');
  });

  it('closes on Escape, an outside click and the button', () => {
    render(<div><span>outside</span><BidsHelp /></div>);
    const trigger = screen.getByRole('button', { name: 'What do these numbers mean?' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the popover open when the click is inside it', () => {
    render(<BidsHelp />);
    fireEvent.click(screen.getByRole('button', { name: 'What do these numbers mean?' }));
    fireEvent.mouseDown(screen.getByText('Approved'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
