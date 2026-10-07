/** Interview shapes shared by the interview pages and components. */
import type { CallerMethod, InterviewCaller, InterviewStageEntry } from '../../api/endpoints';

export type { CallerMethod, InterviewCaller };

export type AccountRef = { _id: string; name?: string; email?: string; country?: string | null; region?: string | null };
export type CreatorRef = { _id: string; name?: string; email?: string };


export const CALLER_METHOD_OPTIONS: { value: CallerMethod; label: string }[] = [
  { value: 'video', label: 'Video meeting link' },
  { value: 'phone_hushed', label: 'Phone (Hushed)' },
  { value: 'phone_slynumber', label: 'Phone (Slynumber)' },
];

export type Interview = {
  _id: string;
  accountId: AccountRef | string;
  createdBy: CreatorRef | string;
  scheduledAt: string;
  endsAt?: string | null;
  stage?: string | null;
  status?: string | null;
  companyName?: string | null;
  interviewerName?: string | null;
  appliedPosition?: string | null;
  jobUrl?: string | null;
  /** Legacy interview-level text; per-round text lives on `stageHistory` entries. */
  transcript?: string;
  note?: string;
  stageHistory?: InterviewStageEntry[];
  caller?: InterviewCaller | null;
  /** The latest round's confirmed flag. */
  confirmed?: boolean;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

