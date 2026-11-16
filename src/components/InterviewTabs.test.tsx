// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InterviewTabs from './InterviewTabs';

afterEach(cleanup);

const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
const renderAt = (url: string) =>
  render(<MemoryRouter initialEntries={[url]}><InterviewTabs /></MemoryRouter>);

describe('InterviewTabs', () => {
  it('carries the filters between Interviews and Caller schedule, but not the page or one-off links', () => {
    renderAt('/interviews?range=next_week&q=acme&stage=intro&page=3&panel=abc');
    expect(href('Interviews')).toBe('/interviews?range=next_week&q=acme&stage=intro');
    expect(href('Caller schedule')).toBe('/interviews/callers?range=next_week&q=acme&stage=intro');
  });

  it('goes to the Callers directory plain: no date or stage keys', () => {
    renderAt('/interviews?range=next_week&q=acme&stage=intro');
    expect(href('Callers')).toBe('/interviews/callers/list');
  });

  it('goes back from the Callers directory plain too', () => {
    renderAt('/interviews/callers/list');
    expect(href('Interviews')).toBe('/interviews');
    expect(href('Caller schedule')).toBe('/interviews/callers');
  });

  it('works from the calendar views', () => {
    renderAt('/interviews/callers/calendar?range=last_week&caller=c1');
    expect(href('Interviews')).toBe('/interviews?range=last_week&caller=c1');
  });
});
