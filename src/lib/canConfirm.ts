import type { InterviewCaller } from '../api/endpoints';
import type { Interview } from '../components/interview/types';

type Who = { id: string; role: string } | null | undefined;
type Round = { caller?: InterviewCaller | null } | null | undefined;

/** A caller round with no caller assigned yet: the caller is on, but nobody is picked (or only the "TBD" placeholder). */
export function isTbdRound(round: Round): boolean {
  const c = round?.caller;
  if (!c?.enabled) return false;
  return !c.callerId && (!c.callerName || c.callerName === 'TBD');
}

/** Who may confirm / unconfirm a caller round: admin, interview manager, the interview's owner, or the round's assigned user caller. */
export function canConfirm(user: Who, interview: Pick<Interview, 'createdBy'>, round: Round): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'interview_manager') return true;
  const ownerId = typeof interview.createdBy === 'object' ? interview.createdBy?._id : interview.createdBy;
  if (ownerId && ownerId === user.id) return true;
  const caller = round?.caller;
  return caller?.callerKind === 'user' && !!caller.callerId && caller.callerId === user.id;
}

/**
 * Who may set a round's status and change its time: admin, interview manager (on any interview) and the owner.
 * Never on someone else's view-only (`summaryOnly`) interview. Matches the server's `can_update_round`.
 */
export function canUpdateRound(user: Who, interview: Pick<Interview, 'createdBy' | 'summaryOnly'>): boolean {
  if (!user || interview.summaryOnly) return false;
  if (user.role === 'admin' || user.role === 'interview_manager') return true;
  const ownerId = typeof interview.createdBy === 'object' ? interview.createdBy?._id : interview.createdBy;
  return !!ownerId && ownerId === user.id;
}
