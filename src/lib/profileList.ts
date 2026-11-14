// Profiles list helpers. No value imports, so Node's test runner loads this file as is (tests/profileList.test.mjs).

type AppliedByCounts = {
  selfAppliedInterviews?: number | null;
  bidderAppliedInterviews?: number | null;
  unsetAppliedInterviews?: number | null;
};

const count = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

/** The Interviews column's second line: who applied for the job (`2 self · 1 bidder`), plus `· N not set` only when
 *  some interviews have no "Applied by". */
export function interviewsAppliedBy(m: AppliedByCounts): string {
  const parts = [`${count(m.selfAppliedInterviews)} self`, `${count(m.bidderAppliedInterviews)} bidder`];
  if ((m.unsetAppliedInterviews ?? 0) > 0) parts.push(`${count(m.unsetAppliedInterviews)} not set`);
  return parts.join(' · ');
}
