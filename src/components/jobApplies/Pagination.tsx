import type { Pagination as PaginationInfo } from '../../api/endpoints';

export const PAGE_SIZES = [25, 50, 100, 200];

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageList(page: number, total: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

export default function Pagination({
  info,
  onPage,
  pageSize,
  onPageSize,
  label,
}: {
  info: PaginationInfo | undefined;
  onPage: (page: number) => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  /** Distinguishes the top and bottom bars for screen readers. */
  label: string;
}) {
  if (!info || info.total === 0) return null;
  const from = (info.page - 1) * info.limit + 1;
  const to = Math.min(info.total, info.page * info.limit);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {info.totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="btn-outline btn-sm" onClick={() => onPage(info.page - 1)} disabled={!info.hasPrev}>
            Previous
          </button>
          {pageList(info.page, info.totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-zinc-400" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === info.page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`${p === info.page ? 'btn' : 'btn-outline'} btn-sm min-w-[2.25rem] tabular-nums`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className="btn-outline btn-sm" onClick={() => onPage(info.page + 1)} disabled={!info.hasNext}>
            Next
          </button>
          <span className="ml-1 whitespace-nowrap tabular-nums text-xs text-zinc-500">
            {from}–{to} of {info.total}
          </span>
        </div>
      )}
      <label className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-500">
        <select
          className="rounded-lg border border-zinc-200 bg-white py-1 pl-2 pr-6 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Jobs per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        / page
      </label>
    </nav>
  );
}
