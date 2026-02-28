import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { isInPauseWindow } from '../../../src/services/scheduleService';
import type { PauseWindow } from '../../../src/config/focus';

dayjs.extend(isBetween);

const pauses: PauseWindow[] = [
  { start: '12:00', end: '13:30' },
  { start: '18:00', end: '19:30' },
];
const allDaysActive = [0, 1, 2, 3, 4, 5, 6];
const onlyMondayDaysActive = [1];


describe('isInPauseWindow', () => {

  it('Active day, during pause window → true', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T12:30:00'), allDaysActive, pauses);
    expect(result).toBe(true);
  });

  it('Active day, outside any pause window → false', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T15:00:00'), allDaysActive, pauses);
    expect(result).toBe(false);
  });

  it('Inactive day (not in activeDays) → true', () => {
    const tuesday = dayjs('2025-03-04T15:00:00');
    const result = isInPauseWindow(tuesday, onlyMondayDaysActive, pauses);
    expect(result).toBe(true);
  });

  it('Boundary: exactly at pause start → true / inclusive start [)', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T12:00:00'), allDaysActive, pauses);
    expect(result).toBe(true);
  });

  it('Boundary: exactly at pause end → false / exclusive end )', () => {
    const result = isInPauseWindow(dayjs('2025-03-03T19:30:00'), allDaysActive, pauses);
    expect(result).toBe(false);
  });
});
