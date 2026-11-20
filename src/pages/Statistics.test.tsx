// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Statistics from './Statistics';

vi.mock('../components/stats/ConversionTab', () => ({ default: () => <p>conversion tab</p> }));
vi.mock('../components/stats/InterviewStatsTab', () => ({ default: () => <p>interview stats tab</p> }));
vi.mock('../components/statistics/ResumeCompareTab', () => ({ default: () => <p>resume tab</p> }));
vi.mock('../components/stats/FramedTab', () => ({ default: () => <p>ai tab</p> }));
vi.mock('../components/statistics/AiUsageCard', () => ({ default: () => null }));
afterEach(cleanup);

const show = (url: string) => render(<MemoryRouter initialEntries={[url]}><Statistics /></MemoryRouter>);

describe('Statistics', () => {
  it('has Bids → Interviews, Interviews, Resume compare and AI usage tabs', () => {
    show('/statistics');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Bids → Interviews', 'Interviews', 'Resume compare', 'AI usage']);
    expect(screen.getByText('conversion tab')).toBeTruthy();
  });

  it('old bids tab URLs still open Bids → Interviews', () => {
    show('/statistics?tab=bids');
    expect(screen.getByRole('tab', { name: 'Bids → Interviews' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('conversion tab')).toBeTruthy();
  });

  it('?tab=interviews opens the Interviews tab', () => {
    show('/statistics?tab=interviews');
    expect(screen.getByRole('tab', { name: 'Interviews' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('interview stats tab')).toBeTruthy();
    expect(screen.queryByText('conversion tab')).toBeNull();
  });
});
