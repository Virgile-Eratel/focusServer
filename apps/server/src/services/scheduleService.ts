import dayjs, { type Dayjs } from '../utils/dayjs';
import { WEEKLY_SCHEDULE, type WeeklySchedule, type DayOfWeek } from '../config/focus';

/**
 * Pure function: determines if `now` falls within a scheduled pause window.
 * Returns true when blocking should be paused (inactive day or inside a pause window).
 */
export function isInPauseWindow(now: Dayjs, schedule: WeeklySchedule): boolean {
  const dayPauses = schedule[now.day() as DayOfWeek];

  // Jour absent du schedule -> non actif -> unblocked
  if (dayPauses === undefined) {
    return true;
  }

  for (const pause of dayPauses) {
    const [startH, startM] = pause.start.split(':').map(Number);
    const [endH, endM] = pause.end.split(':').map(Number);

    const start = now.hour(startH).minute(startM).second(0);
    const end = now.hour(endH).minute(endM).second(0);

    if (now.isBetween(start, end, 'minute', '[)')) {
      return true;
    }
  }

  return false;
}

/** Wrapper using live clock and production config. */
export const isScheduledPause = (): boolean => {
  return isInPauseWindow(dayjs(), WEEKLY_SCHEDULE);
};
