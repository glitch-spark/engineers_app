// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import InterviewSummary from './InterviewSummary';
import type { Interview } from './types';

vi.mock('./RoundCallerPicker', () => ({ default: () => <span>Ana</span> }));
vi.mock('./useBriefDownload', () => ({ useBriefDownload: () => ({ start: vi.fn(), busy: false, dialog: null }) }));

const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();

function iv(over: Record<string, unknown> = {}): Interview {
  return {
    _id: 'iv1', accountId: 'a1', createdBy: 'owner', companyName: 'Acme', scheduledAt: soon,
    stageHistory: [{
      id: 'r1', stage: 'tech1', status: 'scheduled', scheduledAt: soon, confirmed: false,
      caller: { enabled: true, callerKind: 'user', callerId: 'ana1', callerName: 'Ana', method: 'zoom' },
    }],
    ...over,
  } as unknown as Interview;
}

const props = {
  tz: 'UTC', canEdit: true, canSetStatus: true,
  onStatus: vi.fn(), onEditRound: vi.fn(), onDeleteRound: vi.fn(), onEditDetails: vi.fn(), onCallerSaved: vi.fn(),
};

afterEach(cleanup);

describe('InterviewSummary', () => {
  it('shows no confirm control or badge for a round with an assigned caller', () => {
    render(<InterviewSummary iv={iv()} {...props} />);
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /mark confirmed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /unconfirm/i })).toBeNull();
    expect(screen.queryByText(/not confirmed/i)).toBeNull();
  });

  it("shows none on someone else's view-only interview either", () => {
    render(<InterviewSummary iv={iv({ summaryOnly: true })} {...props} canEdit={false} />);
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /mark confirmed/i })).toBeNull();
    expect(screen.queryByText(/confirmed/i)).toBeNull();
  });
});
