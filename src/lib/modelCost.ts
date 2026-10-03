/** "$0.04", "<$0.01", or "free". Costs here are LLM spend, so sub-cent amounts matter. */
export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return 'cost n/a';
  if (amount === 0) return 'free';
  if (amount < 0.001) return '<$0.001';
  if (amount < 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
