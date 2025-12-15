import dayjs from '../utils/dayjs';
import { ACTIVE_DAYS, ALLOWED_PAUSES, type PauseWindow } from '../config/focus';

export type ScheduleService = {
  isScheduledPause: () => boolean;
};

export function createScheduleService(config?: {
  activeDays?: number[];
  allowedPauses?: PauseWindow[];
}): ScheduleService {
  const activeDays = config?.activeDays ?? ACTIVE_DAYS;
  const allowedPauses = config?.allowedPauses ?? ALLOWED_PAUSES;

  function getTodayAt(timeStr: string) {
    const [hour, minute] = timeStr.split(':').map(Number);
    return dayjs().hour(hour).minute(minute).second(0);
  }

  function isScheduledPause(): boolean {
    const now = dayjs();

    // If we're outside active days, we consider it a "pause" (unblocked)
    if (!activeDays.includes(now.day())) {
      return true;
    }

    for (const pause of allowedPauses) {
      const start = getTodayAt(pause.start);
      const end = getTodayAt(pause.end);

      if (now.isBetween(start, end, 'minute', '[)')) {
        return true;
      }
    }

    return false;
  }

  return { isScheduledPause };
}
