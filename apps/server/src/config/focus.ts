export type PauseWindow = { start: string; end: string };

/** 0=Dimanche, 1=Lundi, ..., 6=Samedi (convention dayjs) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Jour absent = non actif (unblocked).
 * Jour présent avec [] = actif sans pause (blocked toute la journée).
 */
export type WeeklySchedule = Partial<Record<DayOfWeek, PauseWindow[]>>;

export const WEEKLY_SCHEDULE: WeeklySchedule = {
  0: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Dimanche
  1: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Lundi
  2: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Mardi
  3: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Mercredi
  4: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Jeudi
  5: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Vendredi
  6: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ], // Samedi
};

export const ALLOWED_ORIGINS: string[] = ['chrome-extension://liagedkhmgfhfmhpjpjgjbilpcdhicif'];
