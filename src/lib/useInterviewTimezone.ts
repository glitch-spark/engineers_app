import { useSyncExternalStore } from 'react';
import { ZONE_OPTIONS, resolveZone, type ZoneChoice } from './interviewTimezone';

/** The interview pages' display/entry time zone, remembered per browser and shared by every view. */
const KEY = 'interviewTimezone';
const listeners = new Set<() => void>();

function read(): ZoneChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    return ZONE_OPTIONS.some((o) => o.value === v) ? (v as ZoneChoice) : 'local';
  } catch {
    return 'local';
  }
}

let current: ZoneChoice = read();

export function setInterviewZone(choice: ZoneChoice): void {
  current = choice;
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: the choice lasts for this page load */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInterviewTimezone(): { choice: ZoneChoice; tz: string; setChoice: (c: ZoneChoice) => void } {
  const choice = useSyncExternalStore(subscribe, () => current, () => 'local' as ZoneChoice);
  return { choice, tz: resolveZone(choice), setChoice: setInterviewZone };
}
