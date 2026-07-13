import dayjs, { type Dayjs } from '../utils/dayjs';
import { FocusModeEnum, type ApplicableFocusMode } from '@focus/shared';
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

// --- Prochaine transition ---

export type NextTransition = { mode: ApplicableFocusMode; at: Dayjs };

/**
 * Le planning est hebdomadaire : au-delà de 7 jours il se répète à l'identique.
 * On balaye J+0 à J+7 pour couvrir une semaine pleine depuis n'importe quelle
 * heure de la journée en cours.
 */
const LOOKAHEAD_DAYS = 7;

/** Mode induit par le planning à un instant donné. */
function modeAt(instant: Dayjs, schedule: WeeklySchedule): ApplicableFocusMode {
  return isInPauseWindow(instant, schedule) ? FocusModeEnum.unblocked : FocusModeEnum.blocked;
}

function atTime(day: Dayjs, hhmm: string): Dayjs {
  const [hour, minute] = hhmm.split(':').map(Number);
  return day.hour(hour).minute(minute).second(0).millisecond(0);
}

/**
 * Instants où le mode peut basculer, triés, strictement postérieurs à `now`.
 *
 * Minuit fait partie des candidats : un jour absent du planning est débloqué en
 * entier, donc la bascule tombe alors sur le passage d'un jour à l'autre et non
 * sur une borne de pause.
 */
function upcomingBoundaries(now: Dayjs, schedule: WeeklySchedule): Dayjs[] {
  const boundaries: Dayjs[] = [];

  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
    const day = now.add(offset, 'day').startOf('day');
    boundaries.push(day);

    for (const pause of schedule[day.day() as DayOfWeek] ?? []) {
      boundaries.push(atTime(day, pause.start), atTime(day, pause.end));
    }
  }

  return boundaries.filter((at) => at.isAfter(now)).sort((a, b) => a.valueOf() - b.valueOf());
}

/**
 * Pure function: prochain basculement du mode à partir de `now`.
 *
 * Retourne le mode *après* la bascule et l'instant où elle se produit, ou `null`
 * si le planning ne change jamais d'état (toujours bloqué, ou toujours débloqué).
 */
export function getNextTransition(now: Dayjs, schedule: WeeklySchedule): NextTransition | null {
  const currentMode = modeAt(now, schedule);

  for (const at of upcomingBoundaries(now, schedule)) {
    const mode = modeAt(at, schedule);
    if (mode !== currentMode) {
      return { mode, at };
    }
  }

  return null;
}

/** Wrapper using live clock and production config. */
export const getNextTransitionFromNow = (): NextTransition | null => {
  return getNextTransition(dayjs(), WEEKLY_SCHEDULE);
};
