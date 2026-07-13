import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VerdictRow } from '../../../src/services/verdict.service';

/**
 * Vrai node:sqlite en mémoire — zéro mock : c'est précisément la surface
 * expérimentale qu'on veut voir casser en CI si l'API bouge.
 */
describe('verdict.service', () => {
  let verdictService: typeof import('../../../src/services/verdict.service');

  function row(overrides: Partial<VerdictRow> = {}): VerdictRow {
    return {
      domain: 'dailymotion.com',
      category: 'entertainment',
      source: 'ollama',
      decidedAt: '2026-07-13T10:00:00.000Z',
      evidence: '{"title":"Dailymotion"}',
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    process.env.VERDICTS_DB_PATH = ':memory:';
    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));
    verdictService = await import('../../../src/services/verdict.service');
  });

  afterEach(() => {
    verdictService.closeDb();
    delete process.env.VERDICTS_DB_PATH;
    vi.restoreAllMocks();
  });

  it('save → get : aller-retour complet', () => {
    verdictService.saveVerdict(row());
    expect(verdictService.getVerdict('dailymotion.com')).toEqual(row());
  });

  it('get retourne null pour un domaine jamais vu', () => {
    expect(verdictService.getVerdict('unknown.com')).toBeNull();
  });

  it('save écrase un verdict existant (upsert)', () => {
    verdictService.saveVerdict(row({ category: 'unknown', evidence: null }));
    verdictService.saveVerdict(row({ category: 'entertainment', decidedAt: '2026-07-14T08:00:00.000Z' }));

    const stored = verdictService.getVerdict('dailymotion.com');
    expect(stored?.category).toBe('entertainment');
    expect(stored?.decidedAt).toBe('2026-07-14T08:00:00.000Z');
  });

  it('delete retourne true puis false une fois la ligne partie', () => {
    verdictService.saveVerdict(row());
    expect(verdictService.deleteVerdict('dailymotion.com')).toBe(true);
    expect(verdictService.deleteVerdict('dailymotion.com')).toBe(false);
    expect(verdictService.getVerdict('dailymotion.com')).toBeNull();
  });

  it('listRecentVerdicts trie du plus récent au plus ancien et respecte la limite', () => {
    verdictService.saveVerdict(row({ domain: 'a.com', decidedAt: '2026-07-11T00:00:00.000Z' }));
    verdictService.saveVerdict(row({ domain: 'b.com', decidedAt: '2026-07-13T00:00:00.000Z' }));
    verdictService.saveVerdict(row({ domain: 'c.com', decidedAt: '2026-07-12T00:00:00.000Z' }));

    expect(verdictService.listRecentVerdicts().map((v) => v.domain)).toEqual(['b.com', 'c.com', 'a.com']);
    expect(verdictService.listRecentVerdicts(2).map((v) => v.domain)).toEqual(['b.com', 'c.com']);
  });

  it('listUnknownVerdicts ne retourne que les unknown, plus anciens en premier', () => {
    verdictService.saveVerdict(row({ domain: 'ok.com', category: 'other' }));
    verdictService.saveVerdict(
      row({ domain: 'later.com', category: 'unknown', decidedAt: '2026-07-13T00:00:00.000Z' }),
    );
    verdictService.saveVerdict(
      row({ domain: 'early.com', category: 'unknown', decidedAt: '2026-07-11T00:00:00.000Z' }),
    );

    expect(verdictService.listUnknownVerdicts().map((v) => v.domain)).toEqual(['early.com', 'later.com']);
  });

  it('persiste une evidence null', () => {
    verdictService.saveVerdict(row({ evidence: null }));
    expect(verdictService.getVerdict('dailymotion.com')?.evidence).toBeNull();
  });
});
