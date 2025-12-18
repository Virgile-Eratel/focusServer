import dayjs from '../utils/dayjs';
import { WEEKDAY_PAUSE_LIMIT_MIN, WEEKEND_PAUSE_LIMIT_MIN } from '../config/focus';

type DayKey = string; // YYYY-MM-DD

export type PauseQuotaService = {
  getDailyPauseLimitMinutes: (ts?: number) => number;
  getDailyPauseUsedMs: (ts?: number) => number;
  getDailyPauseRemainingMs: (ts?: number) => number;
  addUsage: (startMs: number, endMs: number) => void;
};

export function createPauseQuotaService(): PauseQuotaService {
  const usageMsByDay = new Map<DayKey, number>();

  function getDayKey(ts: number): DayKey {
    return dayjs(ts).format('YYYY-MM-DD');
  }

  function getDailyPauseLimitMinutes(ts: number = Date.now()): number {
    const d = dayjs(ts).day(); // 0=Sun ... 6=Sat
    const isWeekend = d === 0 || d === 6;
    return isWeekend ? WEEKEND_PAUSE_LIMIT_MIN : WEEKDAY_PAUSE_LIMIT_MIN;
  }

  function getDailyPauseUsedMs(ts: number = Date.now()): number {
    return usageMsByDay.get(getDayKey(ts)) ?? 0;
  }

  function getDailyPauseRemainingMs(ts: number = Date.now()): number {
    const limitMs = getDailyPauseLimitMinutes(ts) * 60 * 1000;
    const usedMs = getDailyPauseUsedMs(ts);
    return Math.max(0, limitMs - usedMs);
  }

  function addUsage(startMs: number, endMs: number) {
    if (endMs <= startMs) return;

    // Split usage across day boundaries so quotas reset cleanly at midnight.
    let cursor = startMs;
    while (cursor < endMs) {
      const dayEnd = dayjs(cursor).endOf('day').valueOf() + 1; // next ms after end of day
      const chunkEnd = Math.min(endMs, dayEnd);
      const key = getDayKey(cursor);
      const prev = usageMsByDay.get(key) ?? 0;
      usageMsByDay.set(key, prev + (chunkEnd - cursor));
      cursor = chunkEnd;
    }
  }

  return {
    getDailyPauseLimitMinutes,
    getDailyPauseUsedMs,
    getDailyPauseRemainingMs,
    addUsage,
  };
}
