/** US dollars with thousands separators and two decimals, e.g. `$1,234.50`. */
export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
