import dayjs from '../utils/dayjs';
import { ACTIVE_DAYS, ALLOWED_PAUSES, type PauseWindow } from '../config/focus';


const activeDays = ACTIVE_DAYS;
const allowedPauses: PauseWindow[] = ALLOWED_PAUSES;

function getTodayAt(timeStr: string) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0);
}

export const isScheduledPause = (): boolean => {
  const now = dayjs();

  // Not active days -> unblocked
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