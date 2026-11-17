import { describe, expect, it } from 'vitest';
import { canUpdateRound } from './canConfirm';

const iv = (over: Record<string, unknown> = {}) => ({ createdBy: 'owner1', ...over }) as never;

describe('canUpdateRound', () => {
  it('lets an admin set status and time on any interview', () => {
    expect(canUpdateRound({ id: 'a', role: 'admin' }, iv())).toBe(true);
  });

  it("lets an interview manager do it on someone else's interview", () => {
    expect(canUpdateRound({ id: 'm', role: 'interview_manager' }, iv())).toBe(true);
  });

  it('lets the owner do it, whether createdBy is an id or a populated user', () => {
    expect(canUpdateRound({ id: 'owner1', role: 'staff' }, iv())).toBe(true);
    expect(canUpdateRound({ id: 'owner1', role: 'staff' }, iv({ createdBy: { _id: 'owner1' } }))).toBe(true);
  });

  it('refuses a staff stranger', () => {
    expect(canUpdateRound({ id: 's', role: 'staff' }, iv())).toBe(false);
  });

  it('refuses everyone on a view-only (summaryOnly) interview', () => {
    expect(canUpdateRound({ id: 'owner1', role: 'admin' }, iv({ summaryOnly: true }))).toBe(false);
    expect(canUpdateRound({ id: 'm', role: 'interview_manager' }, iv({ summaryOnly: true }))).toBe(false);
  });

  it('refuses without a user', () => {
    expect(canUpdateRound(null, iv())).toBe(false);
    expect(canUpdateRound(undefined, iv())).toBe(false);
  });
});
