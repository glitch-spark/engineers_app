/** One IANA zone per UTC hour from −12 to +14 (27 options). Keep in sync with
 * engineers_backend/app/slack_timezones.py
 */
export type SlackTimezoneOption = { value: string; label: string };

export const SLACK_DIGEST_TIMEZONES: SlackTimezoneOption[] = [
  { value: 'Etc/GMT+12', label: 'UTC−12:00' },
  { value: 'Pacific/Pago_Pago', label: 'Pacific/Pago Pago (GMT−11:00)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (GMT−10:00)' },
  { value: 'America/Anchorage', label: 'America/Anchorage (GMT−9:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (GMT−8:00)' },
  { value: 'America/Denver', label: 'America/Denver (GMT−7:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (GMT−6:00)' },
  { value: 'America/New_York', label: 'America/New York (GMT−5:00)' },
  { value: 'America/Halifax', label: 'America/Halifax (GMT−4:00)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao Paulo (GMT−3:00)' },
  { value: 'America/Noronha', label: 'America/Noronha (GMT−2:00)' },
  { value: 'Atlantic/Azores', label: 'Atlantic/Azores (GMT−1:00)' },
  { value: 'UTC', label: 'UTC (GMT+0:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (GMT+1:00)' },
  { value: 'Europe/Athens', label: 'Europe/Athens (GMT+2:00)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (GMT+3:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GMT+4:00)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (GMT+5:00)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (GMT+6:00)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (GMT+7:00)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong (GMT+8:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+9:00)' },
  { value: 'Australia/Brisbane', label: 'Australia/Brisbane (GMT+10:00)' },
  { value: 'Pacific/Noumea', label: 'Pacific/Noumea (GMT+11:00)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (GMT+12:00)' },
  { value: 'Pacific/Tongatapu', label: 'Pacific/Tongatapu (GMT+13:00)' },
  { value: 'Pacific/Kiritimati', label: 'Pacific/Kiritimati (GMT+14:00)' },
];

const ALLOWED = new Set(SLACK_DIGEST_TIMEZONES.map((z) => z.value));

export function listTimeZones(): SlackTimezoneOption[] {
  return SLACK_DIGEST_TIMEZONES;
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
