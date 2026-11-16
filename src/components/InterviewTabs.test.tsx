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
  it('carries the filters between Self interviews and Caller interviews, but not the page or one-off links', () => {
    renderAt('/interviews?range=next_week&q=acme&stage=intro&page=3&panel=abc');
    expect(href('Self interviews')).toBe('/interviews?range=next_week&q=acme&stage=intro');
    expect(href('Caller interviews')).toBe('/interviews/callers?range=next_week&q=acme&stage=intro');
  });

  it('goes to Manage callers plain: no date or stage keys', () => {
    renderAt('/interviews?range=next_week&q=acme&stage=intro');
    expect(href('Manage callers')).toBe('/interviews/callers/list');
  });

  it('goes back from Manage callers plain too', () => {
    renderAt('/interviews/callers/list');
    expect(href('Self interviews')).toBe('/interviews');
    expect(href('Caller interviews')).toBe('/interviews/callers');
  });

  it('does not carry the retired call key', () => {
    renderAt('/interviews?call=caller&q=acme');
    expect(href('Caller interviews')).toBe('/interviews/callers?q=acme');
  });

  it('labels the tabs Self interviews, Caller interviews and Manage callers', () => {
    renderAt('/interviews');
    const labels = screen.getAllByRole('link').map((a) => a.textContent);
    expect(labels).toEqual(['Self interviews', 'Caller interviews', 'Manage callers']);
  });

  it('works from the calendar views', () => {
    renderAt('/interviews/callers/calendar?range=last_week&caller=c1');
    expect(href('Self interviews')).toBe('/interviews?range=last_week&caller=c1');
  });
});
