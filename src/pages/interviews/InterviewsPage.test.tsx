// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import InterviewsPage from './InterviewsPage';

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', role: 'staff' } }),
}));

afterEach(cleanup);

function Where({ name }: { name: string }) {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${name} ${pathname}${search}`}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/interviews" element={<InterviewsPage view="list" />} />
        <Route path="/interviews/calendar" element={<InterviewsPage view="calendar" />} />
        <Route path="/interviews/callers" element={<Where name="callers-list" />} />
        <Route path="/interviews/callers/calendar" element={<Where name="callers-calendar" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('InterviewsPage old ?call= links', () => {
  it('redirects /interviews?call=caller to Caller interviews, keeping the other keys', () => {
    renderAt('/interviews?call=caller&q=acme&range=next_week');
    expect(screen.getByTestId('where').textContent).toBe('callers-list /interviews/callers?q=acme&range=next_week');
  });

  it('redirects the calendar variant to the Caller interviews calendar', () => {
    renderAt('/interviews/calendar?stage=intro&call=caller');
    expect(screen.getByTestId('where').textContent).toBe('callers-calendar /interviews/callers/calendar?stage=intro');
  });
});
