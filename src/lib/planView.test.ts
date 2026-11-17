import { describe, expect, it } from 'vitest';
import { planView } from './planView';

const staff = (user: string | null, view: string | null = null) => planView({ isAdmin: false, userId: 'me', user, view });
const admin = (user: string | null, view: string | null = null) => planView({ isAdmin: true, userId: 'adm', user, view });

describe('planView (Daily plan)', () => {
  it('staff land on their own, editable board', () => {
    expect(staff(null)).toEqual({ viewUser: undefined, readOnly: false, teamView: false });
  });
  it('staff open the team table with view=team', () => {
    expect(staff(null, 'team')).toEqual({ viewUser: undefined, readOnly: false, teamView: true });
  });
  it("a teammate's board is read-only for staff", () => {
    expect(staff('u2')).toEqual({ viewUser: 'u2', readOnly: true, teamView: false });
    expect(staff('u2', 'team')).toEqual({ viewUser: 'u2', readOnly: true, teamView: false });
  });
  it('their own id is their own, editable board', () => {
    expect(staff('me')).toEqual({ viewUser: undefined, readOnly: false, teamView: false });
  });
  it('admins land on the team table and read every board', () => {
    expect(admin(null)).toEqual({ viewUser: undefined, readOnly: true, teamView: true });
    expect(admin('u2')).toEqual({ viewUser: 'u2', readOnly: true, teamView: false });
  });
});
