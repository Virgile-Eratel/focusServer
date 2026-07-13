import { describe, it, expect } from 'vitest';
import { formatCountdown, formatDay, formatTime } from '../../../src/popup/lib/schedule';

// 2025-03-03 = lundi
const monday = (time: string) => new Date(`2025-03-03T${time}`);

describe('formatDay', () => {
  it('même jour → « aujourd’hui »', () => {
    expect(formatDay(monday('18:00:00'), monday('11:00:00'))).toBe("aujourd'hui");
  });

  it('jour suivant → « demain », même si l’écart est de quelques minutes', () => {
    expect(formatDay(new Date('2025-03-04T00:10:00'), monday('23:55:00'))).toBe('demain');
  });

  it('au-delà de demain → le jour de la semaine', () => {
    expect(formatDay(new Date('2025-03-08T09:00:00'), monday('11:00:00'))).toBe('samedi');
  });

  it('presque 24 h d’écart mais même jour civil → « aujourd’hui »', () => {
    expect(formatDay(monday('23:59:00'), monday('00:01:00'))).toBe("aujourd'hui");
  });
});

describe('formatTime', () => {
  it('formate en HH:mm sur 24 h', () => {
    expect(formatTime(monday('18:00:00'))).toBe('18:00');
    expect(formatTime(monday('09:05:00'))).toBe('09:05');
  });
});

describe('formatCountdown', () => {
  it('moins d’une heure → minutes', () => {
    expect(formatCountdown(monday('12:00:00'), monday('11:18:00'))).toBe('dans 42 min');
  });

  it('heure pleine → pas de reste affiché', () => {
    expect(formatCountdown(monday('14:00:00'), monday('12:00:00'))).toBe('dans 2 h');
  });

  it('heures + minutes → reste sur deux chiffres', () => {
    expect(formatCountdown(monday('15:10:00'), monday('12:00:00'))).toBe('dans 3 h 10');
    expect(formatCountdown(monday('15:05:00'), monday('12:00:00'))).toBe('dans 3 h 05');
  });

  it('au-delà de 24 h → jours', () => {
    expect(formatCountdown(new Date('2025-03-05T12:00:00'), monday('12:00:00'))).toBe('dans 2 jours');
    expect(formatCountdown(new Date('2025-03-04T12:00:00'), monday('12:00:00'))).toBe('dans 1 jour');
  });

  it('transition déjà passée ou à l’instant → « imminent »', () => {
    expect(formatCountdown(monday('12:00:00'), monday('12:00:00'))).toBe('imminent');
    expect(formatCountdown(monday('11:00:00'), monday('12:00:00'))).toBe('imminent');
  });
});
