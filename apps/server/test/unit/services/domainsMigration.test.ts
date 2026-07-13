import { describe, it, expect } from 'vitest';
import { migrateConfig, migrateV1ToV2 } from '../../../src/services/domainsMigration';
import type { DomainsConfigV1 } from '../../../src/types/domains';

const v1Config: DomainsConfigV1 = {
  version: 1,
  defaults: { includeWww: true, includeMobile: false, hosts: true, pf: true },
  entries: [
    { domain: 'porn.com', tags: ['adult'] },
    { domain: 'instagram.com', tags: ['social'] },
    { domain: 'youtube.com', tags: ['video'], includeMobile: true, aliases: ['youtu.be'], pf: false },
    { domain: 'lemonde.fr', tags: ['news'] },
    { domain: 'example.com' },
  ],
};

describe('migrateV1ToV2', () => {
  it('applique la table de correspondance tags[0] → category', () => {
    const migrated = migrateV1ToV2(v1Config);
    const categories = migrated.entries.map((e) => [e.domain, e.category]);
    expect(categories).toEqual([
      ['porn.com', 'adult'],
      ['instagram.com', 'entertainment'],
      ['youtube.com', 'entertainment'],
      ['lemonde.fr', 'other'], // tag inconnu → other
      ['example.com', 'other'], // sans tag → other
    ]);
  });

  it('bumpe la version et marque toutes les entrées manual', () => {
    const migrated = migrateV1ToV2(v1Config);
    expect(migrated.version).toBe(2);
    expect(migrated.entries.every((e) => e.source === 'manual')).toBe(true);
  });

  it('supprime tags et préserve tout le reste (aliases, drapeaux, ordre, defaults)', () => {
    const migrated = migrateV1ToV2(v1Config);
    expect(migrated.defaults).toEqual(v1Config.defaults);
    expect(migrated.entries.map((e) => e.domain)).toEqual(v1Config.entries.map((e) => e.domain));

    const youtube = migrated.entries[2];
    expect(youtube).toEqual({
      domain: 'youtube.com',
      category: 'entertainment',
      source: 'manual',
      includeMobile: true,
      aliases: ['youtu.be'],
      pf: false,
    });
    expect('tags' in youtube).toBe(false);
  });
});

describe('migrateConfig', () => {
  it('migre un v1', () => {
    const { config, migrated } = migrateConfig(v1Config);
    expect(migrated).toBe(true);
    expect(config.version).toBe(2);
  });

  it('retourne un v2 tel quel', () => {
    const v2 = migrateV1ToV2(v1Config);
    const { config, migrated } = migrateConfig(v2);
    expect(migrated).toBe(false);
    expect(config).toBe(v2);
  });

  it('est idempotente : migrer un fichier déjà migré ne change rien', () => {
    const once = migrateConfig(v1Config).config;
    const twice = migrateConfig(once).config;
    expect(twice).toEqual(once);
  });

  it('rejette une version inconnue', () => {
    expect(() => migrateConfig({ version: 3, entries: [] })).toThrow(/Unsupported domains.json version/);
  });

  it('rejette des entries absentes', () => {
    expect(() => migrateConfig({ version: 2 })).toThrow(/must be an array/);
  });

  it('signale les entrées v1 qui cessent d’être bloquées (→ other)', () => {
    const { warnings } = migrateConfig(v1Config);
    expect(warnings).toHaveLength(2); // lemonde.fr + example.com
    expect(warnings[0]).toContain('lemonde.fr');
    expect(warnings[1]).toContain('example.com');
  });

  it('normalise fail closed une entrée v2 sans catégorie valide', () => {
    // Le piège de l'édition à la main : sans catégorie, l'entrée serait
    // silencieusement absente de tous les fichiers générés.
    const { config, warnings } = migrateConfig({
      version: 2,
      defaults: {},
      entries: [{ domain: 'youtube.com' }, { domain: 'ok.com', category: 'adult', source: 'manual' }],
    });

    expect(config.entries[0]).toMatchObject({ category: 'entertainment', source: 'manual' });
    expect(config.entries[1]).toMatchObject({ category: 'adult' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('youtube.com');
  });

  it('un v2 propre ne produit aucun avertissement', () => {
    const { warnings } = migrateConfig(migrateV1ToV2(v1Config));
    expect(warnings).toEqual([]);
  });
});
