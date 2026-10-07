/** Whether a caller round's caller is lined up: green "Confirmed" or amber "Not confirmed". */
export default function ConfirmedBadge({ confirmed }: { confirmed?: boolean }) {
  return confirmed ? (
    <span className="badge-success" title="The caller is lined up">Confirmed</span>
  ) : (
    <span className="badge-warning" title="Waiting for the interview manager to line up a caller">Not confirmed</span>
  );
}
