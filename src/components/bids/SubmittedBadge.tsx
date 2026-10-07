import type { BidReviewItem } from '../../api/endpoints';
import { NOT_SUBMITTED_TIP, fmtTime } from './util';

/** Green "Submitted" when a Submit screenshot exists, else amber "Not marked submitted". */
export default function SubmittedBadge({ bid }: { bid: BidReviewItem }) {
  return bid.submittedAt ? (
    <span className="badge-success" title={`Submit screenshot at ${fmtTime(bid.submittedAt)}`}>Submitted</span>
  ) : (
    <span className="badge-warning" title={NOT_SUBMITTED_TIP}>Not marked submitted</span>
  );
}
