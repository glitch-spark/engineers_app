// lib/slack.ts

type SlackBlock = Record<string, any>;

async function postToSlack(payload: { text: string; blocks: SlackBlock[] }) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // quietly skip if not configured
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function fmtUSD(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function appBaseUrl() {
  return process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
}

/** New transaction (Block Kit) */
export async function notifyNewTransaction(payload: {
  creatorEmail: string;
  amount: number;
  date: string; // yyyy-mm-dd
  description?: string;
}) {
  const text = `New transaction by ${payload.creatorEmail} (${fmtUSD(payload.amount)} on ${payload.date})`;
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: '💸 New Transaction', emoji: true } },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*By:*\n${payload.creatorEmail || '—'}` },
        { type: 'mrkdwn', text: `*Amount:*\n${fmtUSD(payload.amount)}` },
        { type: 'mrkdwn', text: `*Date:*\n${payload.date || '—'}` },
        { type: 'mrkdwn', text: `*Description:*\n${payload.description || '—'}` },
      ],
    },
    {
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Transactions' }, url: `${appBaseUrl()}/transactions` }],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Posted by your app • ${new Date().toLocaleString()}` }] },
  ];
  await postToSlack({ text, blocks });
}

/** Transaction status change (Block Kit) */
export async function notifyTransactionStatusChange(payload: {
  txId: string;
  newStatus: 'approved' | 'rejected';
  approverEmail: string;
  ownerEmail?: string;
  amount?: number;
  date?: string; // yyyy-mm-dd
  notes?: string;
}) {
  const emoji = payload.newStatus === 'approved' ? '✅' : '⛔';
  const text = `Transaction ${payload.newStatus.toUpperCase()} by ${payload.approverEmail}`;
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: `${emoji} Transaction ${payload.newStatus.toUpperCase()}`, emoji: true } },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Tx ID:*\n${payload.txId}` },
        { type: 'mrkdwn', text: `*Owner:*\n${payload.ownerEmail || '—'}` },
        { type: 'mrkdwn', text: `*Amount:*\n${payload.amount != null ? fmtUSD(payload.amount) : '—'}` },
        { type: 'mrkdwn', text: `*Date:*\n${payload.date || '—'}` },
        { type: 'mrkdwn', text: `*Approver:*\n${payload.approverEmail || '—'}` },
        { type: 'mrkdwn', text: `*Status:*\n${payload.newStatus}` },
      ],
    },
  ];
  if (payload.notes) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Notes*\n${payload.notes}` } });
  }
  blocks.push({
    type: 'actions',
    elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Transactions' }, url: `${appBaseUrl()}/transactions` }],
  });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Posted by your app • ${new Date().toLocaleString()}` }] });
  await postToSlack({ text, blocks });
}
