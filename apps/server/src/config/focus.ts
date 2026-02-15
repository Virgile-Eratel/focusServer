export type PauseWindow = { start: string; end: string };

// Jours où le blocage est actif (0=Dimanche, 1=Lundi... 6=Samedi)
export const ACTIVE_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];

export const ALLOWED_PAUSES: PauseWindow[] = [
  { start: '12:00', end: '13:30' },
  { start: '18:00', end: '19:30' },
];

export const ALLOWED_ORIGINS: string[] = [
  "chrome-extension://liagedkhmgfhfmhpjpjgjbilpcdhicif",
];
