// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './Dashboard';

afterEach(cleanup);
let role = 'staff';
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { role } }) }));
vi.mock('../components/home/TodayCard', () => ({ default: () => <div>today-stub</div> }));
vi.mock('../components/home/WeekCard', () => ({ default: () => <div>week-stub</div> }));
vi.mock('../components/home/MetricsCard', () => ({ default: () => <div>metrics-stub</div> }));
vi.mock('../components/dashboard/TeamOverview', () => ({ default: () => <div>team-stub</div> }));

const renderIt = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);

describe('Home', () => {
  it('staff see Today, This week and Metrics only', () => {
    role = 'staff';
    renderIt();
    expect(screen.getByText('today-stub')).toBeTruthy();
    expect(screen.getByText('week-stub')).toBeTruthy();
    expect(screen.getByText('metrics-stub')).toBeTruthy();
    expect(screen.queryByText('team-stub')).toBeNull();
  });

  it('admins also see the team table below', () => {
    role = 'admin';
    renderIt();
    const metrics = screen.getByText('metrics-stub');
    const team = screen.getByText('team-stub');
    expect(metrics.compareDocumentPosition(team) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
