// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PayReadNote } from './PayReadNote';

afterEach(cleanup);

describe('PayReadNote', () => {
  it('flags money that could not be read for part of the period', () => {
    render(<PayReadNote error="listing failed" />);
    expect(screen.getByRole('img', { name: "Couldn't read Bid Track for part of this period" }).getAttribute('title'))
      .toBe("Couldn't read Bid Track for part of this period");
  });

  it('shows nothing when there is no error', () => {
    const { container } = render(<PayReadNote error={null} />);
    expect(container.innerHTML).toBe('');
  });
});
