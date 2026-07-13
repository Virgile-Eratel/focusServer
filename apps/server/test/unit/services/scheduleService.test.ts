import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { getNextTransition, isInPauseWindow } from '../../../src/services/scheduleService';
import type { WeeklySchedule } from '../../../src/config/focus';

dayjs.extend(isBetween);

// Reproduit le comportement par défaut (tous jours actifs, mêmes pauses)
const allDaysSchedule: WeeklySchedule = {
  0: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  1: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  2: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  3: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  4: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  5: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
  6: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
};

// Seul lundi (1) est actif
const onlyMondaySchedule: WeeklySchedule = {
  1: [
    { start: '12:00', end: '13:30' },
    { start: '18:00', end: '19:30' },
  ],
};

describe('isInPauseWindow', () => {
  it('Active day, during pause window → true', () => {
    // 2025-03-03 = Lundi (1)
    const result = isInPauseWindow(dayjs('2025-03-03T12:30:00'), allDaysSchedule);
    expect(result).toBe(true);
  });

  it('Active day, outside any pause window → false', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T15:00:00'), allDaysSchedule);
    expect(result).toBe(false);
  });

  it('Day absent from schedule → true (unblocked)', () => {
    // 2025-03-04 = Mardi (2), absent de onlyMondaySchedule
    const tuesday = dayjs('2025-03-04T15:00:00');
    const result = isInPauseWindow(tuesday, onlyMondaySchedule);
    expect(result).toBe(true);
  });

  it('Boundary: exactly at pause start → true (inclusive start [))', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T12:00:00'), allDaysSchedule);
    expect(result).toBe(true);
  });

  it('Boundary: exactly at pause end → false (exclusive end ))', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T19:30:00'), allDaysSchedule);
    expect(result).toBe(false);
  });

  it('Day present with empty array → false (blocked all day)', () => {
    const noBreakSaturday: WeeklySchedule = { 6: [] };
    // 2025-03-01 = Samedi (6)
    const result = isInPauseWindow(dayjs('2025-03-01T14:00:00'), noBreakSaturday);
    expect(result).toBe(false);
  });

  it('Different pauses per day', () => {
    const perDaySchedule: WeeklySchedule = {
      1: [{ start: '12:00', end: '13:30' }], // Lundi : pause midi
      3: [], // Mercredi : actif sans pause
    };

    // Lundi 12:30 → dans la pause → true
    expect(isInPauseWindow(dayjs('2025-03-03T12:30:00'), perDaySchedule)).toBe(true);

    // Mercredi 12:30 → actif sans pause → false
    expect(isInPauseWindow(dayjs('2025-03-05T12:30:00'), perDaySchedule)).toBe(false);

    // Mardi (absent) → unblocked → true
    expect(isInPauseWindow(dayjs('2025-03-04T12:30:00'), perDaySchedule)).toBe(true);
  });
});

describe('getNextTransition', () => {
  // Rappel : 2025-03-02 = Dimanche, 2025-03-03 = Lundi, 2025-03-04 = Mardi

  it('Blocked, avant une pause → prochain déblocage au début de la pause', () => {
    const next = getNextTransition(dayjs('2025-03-03T11:00:00'), allDaysSchedule);

    expect(next?.mode).toBe('unblocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-03 12:00');
  });

  it('Unblocked, pendant une pause → prochain blocage à la fin de la pause', () => {
    const next = getNextTransition(dayjs('2025-03-03T12:30:00'), allDaysSchedule);

    expect(next?.mode).toBe('blocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-03 13:30');
  });

  it('Blocked après la dernière pause → déblocage le lendemain (franchit minuit)', () => {
    // Lundi 20:00 : après la pause de 18:00-19:30. Minuit est un candidat mais
    // le mardi commence bloqué aussi → la bascule n'a lieu qu'à la pause de midi.
    const next = getNextTransition(dayjs('2025-03-03T20:00:00'), allDaysSchedule);

    expect(next?.mode).toBe('unblocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-04 12:00');
  });

  it('Jour absent du planning → blocage à minuit du prochain jour actif', () => {
    // Dimanche (absent de onlyMondaySchedule) → unblocked toute la journée.
    const next = getNextTransition(dayjs('2025-03-02T15:00:00'), onlyMondaySchedule);

    expect(next?.mode).toBe('blocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-03 00:00');
  });

  it('Fin du dernier jour actif → déblocage à minuit (le jour suivant est inactif)', () => {
    // Lundi 20:00 (bloqué) → mardi absent du planning → unblocked dès minuit.
    const next = getNextTransition(dayjs('2025-03-03T20:00:00'), onlyMondaySchedule);

    expect(next?.mode).toBe('unblocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-04 00:00');
  });

  it('Borne : exactement au début de la pause → déjà unblocked, prochaine bascule = fin de pause', () => {
    const next = getNextTransition(dayjs('2025-03-03T12:00:00'), allDaysSchedule);

    expect(next?.mode).toBe('blocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-03 13:30');
  });

  it('Planning vide (toujours unblocked) → null', () => {
    expect(getNextTransition(dayjs('2025-03-03T11:00:00'), {})).toBeNull();
  });

  it('Tous les jours actifs sans pause (toujours blocked) → null', () => {
    const alwaysBlocked: WeeklySchedule = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

    expect(getNextTransition(dayjs('2025-03-03T11:00:00'), alwaysBlocked)).toBeNull();
  });

  it('Une seule journée active dans la semaine → transition trouvée à 6 jours', () => {
    // Mardi (absent) → unblocked. Prochain lundi actif : 2025-03-10 00:00.
    const next = getNextTransition(dayjs('2025-03-04T09:00:00'), onlyMondaySchedule);

    expect(next?.mode).toBe('blocked');
    expect(next?.at.format('YYYY-MM-DD HH:mm')).toBe('2025-03-10 00:00');
  });
});
