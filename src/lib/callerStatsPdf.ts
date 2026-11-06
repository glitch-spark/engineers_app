import type { CallerRoundGroup, CallerStatsCaller, CallerStatsRound, CallerStatsTotals } from '../api/endpoints';
import { stageLabel } from './stageBadge';

/** What the Callers tab shows for one caller (or All callers), ready to print. Rounds come in the tab's sort order. */
export interface CallerStatsExport {
  /** The caller's name, or 'All callers'. */
  name: string;
  /** All callers: the tables get a row per caller (and a Caller column for rounds) plus the team row. */
  isAll: boolean;
  periodLabel: string;
  regionLabel: string;
  /** Summary rows: the one caller, or every caller with rounds. */
  callers: CallerStatsCaller[];
  /** Every caller round, and rounds without a caller, for the period. */
  team: CallerStatsTotals;
  self: CallerStatsTotals;
  /** Rounds held in the period. */
  rows: CallerStatsRound[];
  callerName: (r: CallerStatsRound) => string;
}

const GROUPS: { key: CallerRoundGroup; label: string }[] = [
  { key: 'intro', label: 'Intro' }, { key: 'tech', label: 'Tech' }, { key: 'hiring', label: 'Hiring' },
  { key: 'panel', label: 'Panel' }, { key: 'final', label: 'Final' },
];

type Result = CallerStatsRound['result'];
const RESULT: Record<Result, string> = {
  passed: 'Passed', rejected: 'Rejected', canceled: 'Canceled', awaiting: 'Awaiting result', scheduled: 'Scheduled',
};

type RGB = [number, number, number];
/** The Callers page's result badges (Tailwind 100 / 800 / 200): fill, text, border. Canceled is struck through. */
const BADGE: Record<Result, { fill: RGB; text: RGB; border: RGB; strike?: boolean }> = {
  passed: { fill: [209, 250, 229], text: [6, 95, 70], border: [167, 243, 208] },
  rejected: { fill: [254, 226, 226], text: [153, 27, 27], border: [254, 202, 202] },
  canceled: { fill: [244, 244, 245], text: [113, 113, 122], border: [228, 228, 231], strike: true },
  awaiting: { fill: [244, 244, 245], text: [63, 63, 70], border: [228, 228, 231] },
  scheduled: { fill: [219, 234, 254], text: [30, 64, 175], border: [191, 219, 254] },
};

const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
const pts = (v: number | null) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 1000) / 10).toFixed(1)} pts`);

function day(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** `callers-<name>-<period>.pdf`, safe on every OS. */
export function callerStatsFilename(name: string, periodLabel: string): string {
  const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `callers-${slug(name) || 'caller'}-${slug(periodLabel) || 'period'}.pdf`;
}

/** Builds the PDF in the browser and saves it. jsPDF is loaded on demand, so it stays out of the main bundle. */
export async function exportCallerStatsPdf(x: CallerStatsExport): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const head = { fillColor: [39, 39, 42] as RGB, textColor: 255, fontStyle: 'bold' as const };
  const base = { margin: { left: margin, right: margin, bottom: 50 }, styles: { fontSize: 9, cellPadding: 5 }, headStyles: head };
  const endY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Caller interview statistics · ${x.name}`, margin, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Period: ${x.periodLabel}   ·   Region: ${x.regionLabel}   ·   Generated: ${new Date().toLocaleString()}`, margin, 68);
  doc.text('Interviews done = passed + rejected + awaiting (canceled not counted). Pass rate = passed ÷ (passed + rejected).', margin, 82);
  doc.setTextColor(0);

  const title = (text: string, note: string) => {
    let y = endY() + 28;
    if (y > pageH - 110) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(text, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(note, margin, y + 13);
    doc.setTextColor(0);
    return y + 22;
  };

  // Summary: one row per caller, plus every caller as the team row.
  const summaryRow = (name: string, t: CallerStatsTotals, vsTeam: number | null) => [
    name, t.done, pct(t.passRate), pts(vsTeam), t.counts.passed, t.counts.rejected, t.counts.awaiting, t.counts.canceled,
  ];
  autoTable(doc, {
    ...base,
    startY: 96,
    head: [['Caller', 'Interviews done', 'Pass rate', 'vs team', 'Passed', 'Rejected', 'Awaiting', 'Canceled']],
    body: x.callers.map((c) => summaryRow(c.name, c, c.vsTeam)),
    foot: x.isAll ? [summaryRow('All callers', x.team, null)] : undefined,
    footStyles: { fillColor: [228, 228, 231], textColor: 0, fontStyle: 'bold' },
    showFoot: 'lastPage',
    didParseCell: (h) => { if (h.column.index > 0) h.cell.styles.halign = 'right'; },
  });

  // Pass rate by round type, with all callers and self rounds for comparison.
  const typeRow = (name: string, t: CallerStatsTotals) => [
    name, ...GROUPS.map((g) => (t.byType[g.key].done ? `${pct(t.byType[g.key].passRate)} · ${t.byType[g.key].done}` : '–')),
  ];
  autoTable(doc, {
    ...base,
    startY: title('Pass rate by round type', 'Each cell: pass rate · interviews done. Self = rounds people took themselves.'),
    head: [['Caller', ...GROUPS.map((g) => g.label)]],
    body: [
      ...x.callers.filter((c) => c.done > 0).map((c) => typeRow(c.name, c)),
      ...(x.isAll ? [typeRow('All callers', x.team)] : []),
      typeRow('Self (no caller)', x.self),
    ],
    didParseCell: (h) => { if (h.column.index > 0) h.cell.styles.halign = 'center'; },
  });

  // Rounds held, the result drawn as a colored pill as on the page.
  const columns = ['Date', ...(x.isAll ? ['Caller'] : []), 'Company', 'Round', 'Engineer', 'Result'];
  const rows = x.rows.map((r) => [
    day(r.roundDate), ...(x.isAll ? [x.callerName(r)] : []), r.company || 'Untitled company', stageLabel(r.stage), r.engineer,
    RESULT[r.result],
  ]);
  const last = columns.length - 1;
  autoTable(doc, {
    ...base,
    startY: title(`Rounds held · ${x.rows.length}`, 'Caller rounds held in this period, with their result now.'),
    head: [columns],
    body: rows.length ? rows : [[{ content: 'No caller rounds held in this period.', colSpan: columns.length, styles: { halign: 'center', textColor: 120 } }]],
    willDrawCell: (h) => { if (rows.length && h.section === 'body' && h.column.index === last) h.cell.text = []; },
    didDrawCell: (h) => {
      if (!rows.length || h.section !== 'body' || h.column.index !== last) return;
      const b = BADGE[x.rows[h.row.index].result];
      const label = RESULT[x.rows[h.row.index].result];
      doc.setFontSize(8);
      const w = doc.getTextWidth(label) + 12;
      const bh = 13;
      const bx = h.cell.x + 5;
      const by = h.cell.y + (h.cell.height - bh) / 2;
      doc.setFillColor(...b.fill);
      doc.setDrawColor(...b.border);
      doc.setLineWidth(0.6);
      doc.roundedRect(bx, by, w, bh, 3, 3, 'FD');
      doc.setTextColor(...b.text);
      doc.text(label, bx + 6, by + bh / 2, { baseline: 'middle' });
      if (b.strike) {
        doc.setDrawColor(...b.text);
        doc.line(bx + 6, by + bh / 2, bx + w - 6, by + bh / 2);
      }
      doc.setTextColor(0);
    },
  });

  const pages = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(120);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`${x.name} · ${x.periodLabel}`, margin, pageH - 24);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 24, { align: 'right' });
  }

  doc.save(callerStatsFilename(x.name, x.periodLabel));
}
