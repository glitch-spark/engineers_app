/** One IANA zone per UTC hour from −12 to +14 (27 options). Keep ids in sync with
 * engineers_backend/app/slack_timezones.py. GMT labels follow the current offset.
 */
export type SlackTimezoneOption = { value: string; label: string };

const SLACK_DIGEST_ZONE_PLACES: { value: string; place: string }[] = [
  { value: 'Etc/GMT+12', place: 'UTC' },
  { value: 'Pacific/Pago_Pago', place: 'Pacific/Pago Pago' },
  { value: 'Pacific/Honolulu', place: 'Pacific/Honolulu' },
  { value: 'America/Anchorage', place: 'America/Anchorage' },
  { value: 'America/Los_Angeles', place: 'America/Los Angeles' },
  { value: 'America/Denver', place: 'America/Denver' },
  { value: 'America/Chicago', place: 'America/Chicago' },
  { value: 'America/New_York', place: 'America/New York' },
  { value: 'America/Halifax', place: 'America/Halifax' },
  { value: 'America/Sao_Paulo', place: 'America/Sao Paulo' },
  { value: 'America/Noronha', place: 'America/Noronha' },
  { value: 'Atlantic/Azores', place: 'Atlantic/Azores' },
  { value: 'UTC', place: 'UTC' },
  { value: 'Europe/Paris', place: 'Europe/Paris' },
  { value: 'Europe/Athens', place: 'Europe/Athens' },
  { value: 'Europe/Moscow', place: 'Europe/Moscow' },
  { value: 'Asia/Dubai', place: 'Asia/Dubai' },
  { value: 'Asia/Karachi', place: 'Asia/Karachi' },
  { value: 'Asia/Dhaka', place: 'Asia/Dhaka' },
  { value: 'Asia/Bangkok', place: 'Asia/Bangkok' },
  { value: 'Asia/Hong_Kong', place: 'Asia/Hong Kong' },
  { value: 'Asia/Tokyo', place: 'Asia/Tokyo' },
  { value: 'Australia/Brisbane', place: 'Australia/Brisbane' },
  { value: 'Pacific/Noumea', place: 'Pacific/Noumea' },
  { value: 'Pacific/Auckland', place: 'Pacific/Auckland' },
  { value: 'Pacific/Tongatapu', place: 'Pacific/Tongatapu' },
  { value: 'Pacific/Kiritimati', place: 'Pacific/Kiritimati' },
];

const ALLOWED = new Set(SLACK_DIGEST_ZONE_PLACES.map((z) => z.value));

/** Live offset, e.g. GMT−4:00. Unicode minus matches the API catalog. */
export function formatGmtOffset(iana: string, when: Date = new Date()): string {
  const raw =
    new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'longOffset',
      hour: '2-digit',
    })
      .formatToParts(when)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return raw.replace(/-/g, '−');
  const sign = match[1] === '-' ? '−' : '+';
  const hours = String(Number(match[2]));
  const minutes = match[3] ?? '00';
  return `GMT${sign}${hours}:${minutes}`;
}

export function timezoneLabel(iana: string, place: string, when: Date = new Date()): string {
  const gmt = formatGmtOffset(iana, when);
  if (iana === 'Etc/GMT+12') return gmt.replace('GMT', 'UTC');
  return `${place} (${gmt})`;
}

export function listTimeZones(when: Date = new Date()): SlackTimezoneOption[] {
  return SLACK_DIGEST_ZONE_PLACES.map((z) => ({
    value: z.value,
    label: timezoneLabel(z.value, z.place, when),
  }));
}

export function normalizeSlackTimezone(value?: string | null): string {
  const cleaned = (value || '').trim();
  if (ALLOWED.has(cleaned)) return cleaned;
  return 'America/New_York';
}

export function padTimePart(n: number): string {
  return String(Math.max(0, Math.min(59, n))).padStart(2, '0');
}

export function timeInputFromParts(hour: number, minute: number): string {
  return `${padTimePart(hour)}:${padTimePart(minute)}`;
}

export function partsFromTimeInput(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map((x) => Number(x));
  return {
    hour: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8,
    minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}
