// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiUsageCard from './AiUsageCard';

vi.mock('../../api/endpoints', async (orig) => ({
  ...(await orig<object>()),
  getAiUsage: () => new Promise(() => {}),
}));
vi.mock('../../theme/ThemeProvider', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { role: 'admin', id: 'me' } }) }));
vi.mock('../../lib/useFirstTeamMember', async (orig) => ({ ...(await orig<object>()), useTeamLookup: () => ({ data: { users: [] } }) }));

afterEach(cleanup);
const show = (embedded: boolean) => render(
  <SWRConfig value={{ provider: () => new Map() }}>
    <MemoryRouter><AiUsageCard embedded={embedded} /></MemoryRouter>
  </SWRConfig>,
);

describe('AiUsageCard embedded', () => {
  it('renders the breakdown filters without a second filter bar', () => {
    show(true);
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('Features')).toBeTruthy();
    expect(screen.getByText('Models')).toBeTruthy();
    expect(screen.queryByLabelText('Filters')).toBeNull();
  });

  it('standalone keeps its own bar', () => {
    show(false);
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByLabelText('Filters')).toBeTruthy();
  });
});
