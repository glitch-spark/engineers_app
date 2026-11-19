// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Statistics from './Statistics';

vi.mock('../components/stats/ConversionTab', () => ({ default: () => <p>conversion tab</p> }));
vi.mock('../components/statistics/ResumeCompareTab', () => ({ default: () => <p>resume tab</p> }));
vi.mock('../components/stats/FramedTab', () => ({ default: () => <p>ai tab</p> }));
vi.mock('../components/statistics/AiUsageCard', () => ({ default: () => null }));
afterEach(cleanup);

const show = (url: string) => render(<MemoryRouter initialEntries={[url]}><Statistics /></MemoryRouter>);

describe('Statistics', () => {
  it('has Conversion, Resume compare and AI usage tabs', () => {
    show('/statistics');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Conversion', 'Resume compare', 'AI usage']);
    expect(screen.getByText('conversion tab')).toBeTruthy();
  });

  it.each(['bids', 'interviews'])('old %s tab URLs open Conversion', (tab) => {
    show(`/statistics?tab=${tab}`);
    expect(screen.getByRole('tab', { name: 'Conversion' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('conversion tab')).toBeTruthy();
  });
});
