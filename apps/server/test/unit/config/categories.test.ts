import { describe, it, expect } from 'vitest';
import {
  BLOCKED_FILE_CATEGORIES,
  UNBLOCKED_FILE_CATEGORIES,
  categoriesBlockedDuring,
  getCategoryStates,
  isBlockableCategory,
  isCategoryBlocked,
  isVerdictBlocked,
} from '../../../src/config/categories';
import type { ScheduledTransition } from '@focus/shared';

describe('isCategoryBlocked — la table de vérité de la politique', () => {
  it.each([
    ['adult', false, true],
    ['adult', true, true], // adult : aucune pause, aucune exception
    ['entertainment', false, true],
    ['entertainment', true, false], // libre pendant les fenêtres de pause
    ['other', false, false],
    ['other', true, false], // jamais bloqué
  ] as const)('%s / pause=%s → bloqué=%s', (category, isPause, expected) => {
    expect(isCategoryBlocked(category, isPause)).toBe(expected);
  });
});

describe('isVerdictBlocked — bloquer, c’est savoir', () => {
  it('unknown n’est JAMAIS bloqué, pause ou pas (spec §3.5 révisée)', () => {
    // On ne bloque que sur une preuve. `unknown` = Ollama éteint, page en 403,
    // page muette, nom inconnu — bref : on n'a pas su. Bloquer là-dessus, c'est
    // faire payer le doute au travail (`tiime.fr`, `ancv.com` bloqués comme des
    // distractions). L'humain ajoute à la main ce qu'il veut bloquer.
    expect(isVerdictBlocked('unknown', false)).toBe(false);
    expect(isVerdictBlocked('unknown', true)).toBe(false);
  });

  it('délègue à la politique pour les vraies catégories', () => {
    expect(isVerdictBlocked('entertainment', true)).toBe(false);
    expect(isVerdictBlocked('adult', true)).toBe(true);
  });
});

describe('dérivations de la politique', () => {
  it('isBlockableCategory : adult et entertainment entrent dans la blocklist, pas other', () => {
    expect(isBlockableCategory('adult')).toBe(true);
    expect(isBlockableCategory('entertainment')).toBe(true);
    expect(isBlockableCategory('other')).toBe(false);
  });

  it('les listes de fichiers dérivent de la politique', () => {
    expect(BLOCKED_FILE_CATEGORIES).toEqual(['adult', 'entertainment']);
    expect(UNBLOCKED_FILE_CATEGORIES).toEqual(['adult']);
    expect(categoriesBlockedDuring(false)).toEqual([...BLOCKED_FILE_CATEGORIES]);
    expect(categoriesBlockedDuring(true)).toEqual([...UNBLOCKED_FILE_CATEGORIES]);
  });
});

describe('getCategoryStates', () => {
  const transition: ScheduledTransition = { mode: 'unblocked', at: '2026-07-13T12:00:00.000Z' };

  it('retourne les 3 catégories dans un ordre fixe', () => {
    const states = getCategoryStates(false, transition);
    expect(states.map((s) => s.category)).toEqual(['adult', 'entertainment', 'other']);
  });

  it('seule entertainment porte la transition — adult et other sont constants', () => {
    const states = getCategoryStates(false, transition);
    expect(states.find((s) => s.category === 'adult')?.nextTransition).toBeNull();
    expect(states.find((s) => s.category === 'entertainment')?.nextTransition).toEqual(transition);
    expect(states.find((s) => s.category === 'other')?.nextTransition).toBeNull();
  });

  it('reflète la pause sur entertainment uniquement', () => {
    const paused = getCategoryStates(true, null);
    expect(paused.map((s) => [s.category, s.blocked])).toEqual([
      ['adult', true],
      ['entertainment', false],
      ['other', false],
    ]);

    const focus = getCategoryStates(false, null);
    expect(focus.find((s) => s.category === 'entertainment')?.blocked).toBe(true);
  });
});
