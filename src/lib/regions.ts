/** Region filter options shared by every page; each page shows the subset its endpoint supports. */
export interface RegionOption {
  /** '' means every region. `none` means profiles without a region. */
  value: string;
  label: string;
}

export const REGION_OPTIONS: RegionOption[] = [
  { value: '', label: 'All' },
  { value: 'Latam', label: 'LATAM' },
  { value: 'EU', label: 'EU' },
  { value: 'US', label: 'US' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Asia', label: 'Asia' },
  { value: 'none', label: 'No region' },
];

/**
 * The options for the regions named in `subset` (values, e.g. `['Latam', 'EU', 'US']`), in the standard order.
 * `All` is always first; unknown values are ignored.
 */
export function regionOptions(subset: string[]): RegionOption[] {
  return REGION_OPTIONS.filter((o) => o.value === '' || subset.includes(o.value));
}
