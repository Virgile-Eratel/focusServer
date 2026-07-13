// `en-GB` et non `en-US` : l'horloge reste sur 24 h (« 18:00 », pas « 6:00 PM »),
// comme le planning du serveur.
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** « today », « tomorrow », ou le jour de la semaine. */
export function formatDay(at: Date, now: Date): string {
  const dayGap = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);

  if (dayGap === 0) return 'today';
  if (dayGap === 1) return 'tomorrow';
  return weekdayFormatter.format(at);
}

/** « 18:00 » */
export function formatTime(at: Date): string {
  return timeFormatter.format(at);
}

/** « in 42 min », « in 3h 10m », « in 2 days ». */
export function formatCountdown(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return 'imminent';

  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `in ${hours}h` : `in ${hours}h ${String(rest).padStart(2, '0')}m`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}
