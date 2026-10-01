import { useId } from 'react';
import { ZONE_OPTIONS, zoneAbbrev, type ZoneChoice } from '../../lib/interviewTimezone';
import { useInterviewTimezone } from '../../lib/useInterviewTimezone';

/** Time zone picker for the interview pages (Local, Eastern, Central, Mountain, Pacific). */
export default function ZoneSelect() {
  const id = useId();
  const { choice, tz, setChoice } = useInterviewTimezone();
  const abbrev = zoneAbbrev(new Date(), tz);
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
      <label htmlFor={id} className="text-xs text-muted">Time zone</label>
      <select
        id={id}
        className="select focus-ring !w-auto !pr-9"
        value={choice}
        onChange={(e) => setChoice(e.target.value as ZoneChoice)}
      >
        {ZONE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === 'local' && abbrev ? `${o.label} (${abbrev})` : o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
