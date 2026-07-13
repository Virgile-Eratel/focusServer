const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const weekdayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** « aujourd'hui », « demain », ou le jour de la semaine. */
export function formatDay(at: Date, now: Date): string {
  const dayGap = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);

  if (dayGap === 0) return "aujourd'hui";
  if (dayGap === 1) return 'demain';
  return weekdayFormatter.format(at);
}

/** « 18:00 » */
export function formatTime(at: Date): string {
  return timeFormatter.format(at);
}

/** « dans 42 min », « dans 3 h 10 », « dans 2 jours ». */
export function formatCountdown(at: Date, now: Date): string {
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return 'imminent';

  const minutes = Math.round(ms / MINUTE_MS);
  if (minutes < 60) return `dans ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `dans ${hours} h` : `dans ${hours} h ${String(rest).padStart(2, '0')}`;
  }

  const days = Math.round(hours / 24);
  return days === 1 ? 'dans 1 jour' : `dans ${days} jours`;
}
