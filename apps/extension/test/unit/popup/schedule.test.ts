import { describe, it, expect } from 'vitest';
import { formatCountdown, formatDay, formatTime } from '../../../src/popup/lib/schedule';

// 2025-03-03 = lundi
const monday = (time: string) => new Date(`2025-03-03T${time}`);

describe('formatDay', () => {
  it('même jour → « today »', () => {
    expect(formatDay(monday('18:00:00'), monday('11:00:00'))).toBe('today');
  });

  it('jour suivant → « tomorrow », même si l’écart est de quelques minutes', () => {
    expect(formatDay(new Date('2025-03-04T00:10:00'), monday('23:55:00'))).toBe('tomorrow');
  });

  it('au-delà de demain → le jour de la semaine', () => {
    expect(formatDay(new Date('2025-03-08T09:00:00'), monday('11:00:00'))).toBe('Saturday');
  });

  it('presque 24 h d’écart mais même jour civil → « today »', () => {
    expect(formatDay(monday('23:59:00'), monday('00:01:00'))).toBe('today');
  });
});

describe('formatTime', () => {
  it('formate en HH:mm sur 24 h', () => {
    expect(formatTime(monday('18:00:00'))).toBe('18:00');
    expect(formatTime(monday('09:05:00'))).toBe('09:05');
  });

  // Régression : en anglais, un formateur 12 h rendrait « 12:00 AM » à minuit.
  it('minuit reste 00:00', () => {
    expect(formatTime(monday('00:00:00'))).toBe('00:00');
  });
});

describe('formatCountdown', () => {
  it('moins d’une heure → minutes', () => {
    expect(formatCountdown(monday('12:00:00'), monday('11:18:00'))).toBe('in 42 min');
  });

  it('heure pleine → pas de reste affiché', () => {
    expect(formatCountdown(monday('14:00:00'), monday('12:00:00'))).toBe('in 2h');
  });

  it('heures + minutes → reste sur deux chiffres', () => {
    expect(formatCountdown(monday('15:10:00'), monday('12:00:00'))).toBe('in 3h 10m');
    expect(formatCountdown(monday('15:05:00'), monday('12:00:00'))).toBe('in 3h 05m');
  });

  it('au-delà de 24 h → jours', () => {
    expect(formatCountdown(new Date('2025-03-05T12:00:00'), monday('12:00:00'))).toBe('in 2 days');
    expect(formatCountdown(new Date('2025-03-04T12:00:00'), monday('12:00:00'))).toBe('in 1 day');
  });

  it('transition déjà passée ou à l’instant → « imminent »', () => {
    expect(formatCountdown(monday('12:00:00'), monday('12:00:00'))).toBe('imminent');
    expect(formatCountdown(monday('11:00:00'), monday('12:00:00'))).toBe('imminent');
  });
});
