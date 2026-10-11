import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import type { PromptEvalRow, PromptEvalRun } from '../../api/endpoints';
import { notify } from '../../lib/notify';
import { formatUsd } from '../../lib/modelCost';
import { openTemplatePreview } from '../../lib/templatePreview';
import SidePanel from '../SidePanel';
import { ROLE_LABEL, ROW_STATUS_BADGE, ROW_STATUS_LABEL, formatDuration, formatScore, modelShort, scoreClass } from './format';

function NoteList({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-body">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function ModelLine({
  what,
  model,
  cached,
  fallback,
  tokensIn,
  tokensOut,
  cost,
}: {
  what: string;
  model: string | null | undefined;
  cached: boolean;
  fallback: boolean;
  tokensIn: number | null | undefined;
  tokensOut: number | null | undefined;
  cost: number | null | undefined;
}) {
  return (
    <p className="text-xs text-muted">
      <span className="font-medium text-body">{what}:</span> <span className="font-mono">{modelShort(model)}</span>
      {cached && (
        <span className="badge-neutral ml-1" title="Identical input seen before: the stored result was reused, no model call">
          cached
        </span>
      )}
      {fallback && <span className="badge-warning ml-1">fallback</span>}
      {!cached && tokensIn != null && (
        <span className="ml-2 tabular-nums">
          {tokensIn} in / {tokensOut ?? 0} out
        </span>
      )}
      <span className="ml-2 tabular-nums">{formatUsd(cost)}</span>
    </p>
  );
}

/** One scored JD: the verdict, the models that produced it, and the generated resume. */
export default function RowDetailPanel({
  run,
  row,
  onClose,
}: {
  run: PromptEvalRun;
  row: PromptEvalRow | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const v = row?.verdict;

  function preview() {
    if (!row?.resumeHtml) return;
    try {
      openTemplatePreview(row.resumeHtml, `${run.accountName} · ${row.jdTitle}`);
    } catch (err) {
      notify.error(err, 'Could not open the preview');
    }
  }

  async function copyText() {
    if (!row?.resumeText) return;
    try {
      await navigator.clipboard.writeText(row.resumeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      notify.error(err, 'Could not copy');
    }
  }

  return (
    <SidePanel
      open={row != null}
      onClose={onClose}
      title={row ? `${row.jdTitle} · ${row.jdCompany}` : ''}
      subtitle={row ? `${ROLE_LABEL[row.role]} · ${run.accountName}` : undefined}
      wide
    >
      {row && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={ROW_STATUS_BADGE[row.status]}>{ROW_STATUS_LABEL[row.status]}</span>
            {v && (
              <>
                <span className={scoreClass(v.matchScore)} aria-label={`Match score ${v.matchScore}`}>
                  Match {formatScore(v.matchScore)}
                </span>
                <span className={scoreClass(v.believabilityScore)} aria-label={`Believability score ${v.believabilityScore}`}>
                  Believability {formatScore(v.believabilityScore)}
                </span>
              </>
            )}
            {row.durationMs != null && <span className="text-xs text-faint tabular-nums">{formatDuration(row.durationMs)}</span>}
          </div>

          {row.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {row.error}
            </p>
          )}

          {v?.summary && <p className="text-sm text-body">{v.summary}</p>}

          {v && (
            <div className="grid gap-4 sm:grid-cols-2">
              <NoteList title="Strengths" items={v.strengths} />
              <NoteList title="Missing requirements" items={v.missingRequirements} />
              <NoteList title="Red flags" items={v.redFlags} />
              <NoteList title="Match notes" items={v.matchNotes} />
              <NoteList title="Believability notes" items={v.believabilityNotes} />
            </div>
          )}

          <div className="space-y-1 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
            <ModelLine
              what="Resume"
              model={row.genModelId ?? row.genModel}
              cached={row.genCached}
              fallback={row.genFallbackUsed}
              tokensIn={row.genInputTokens}
              tokensOut={row.genOutputTokens}
              cost={row.genCostUsd}
            />
            {(row.judgeModelId || row.judgeModel) && (
              <ModelLine
                what="Judge"
                model={row.judgeModelId ?? row.judgeModel}
                cached={row.judgeCached}
                fallback={row.judgeFallbackUsed}
                tokensIn={row.judgeInputTokens}
                tokensOut={row.judgeOutputTokens}
                cost={row.judgeCostUsd}
              />
            )}
          </div>

          {row.resumeText && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="card-title">Generated resume</h3>
                <div className="flex gap-2">
                  <button type="button" className="btn-outline btn-sm" onClick={copyText}>
                    <Copy className="h-4 w-4" aria-hidden />
                    {copied ? 'Copied' : 'Copy text'}
                  </button>
                  <button type="button" className="btn-outline btn-sm" onClick={preview} disabled={!row.resumeHtml}>
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Preview
                  </button>
                </div>
              </div>
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-body dark:border-zinc-700 dark:bg-zinc-900">
                {row.resumeText}
              </pre>
            </section>
          )}
        </div>
      )}
    </SidePanel>
  );
}
