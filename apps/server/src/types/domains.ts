import type { Category, DomainSource } from '@focus/shared';

/**
 * Types de `config/domains.json` — l'unique source de vérité de la blocklist.
 *
 * Le fichier du projet est lu à chaque besoin (aucun cache mémoire) et
 * régénère les fichiers système via `systemConfig.service`.
 *
 * Version 2 : `category` (une seule, elle porte la politique de blocage)
 * remplace `tags[]`, et `source` trace l'origine de l'entrée. Les fichiers
 * v1 sont migrés automatiquement (voir `domainsMigration.ts`).
 */

export const DOMAINS_CONFIG_VERSION = 2;

export type DomainEntry = {
  domain: string;
  category: Category;
  source: DomainSource;
  aliases?: string[];
  includeWww?: boolean;
  includeMobile?: boolean;
  /** Inclure ce domaine dans les fichiers hosts générés (défaut: true) */
  hosts?: boolean;
  /** Inclure ce domaine dans les templates PF générés (défaut: true) */
  pf?: boolean;
};

export type DomainDefaults = {
  includeWww?: boolean;
  includeMobile?: boolean;
  hosts?: boolean;
  pf?: boolean;
};

export type DomainsConfig = {
  version: number;
  defaults: DomainDefaults;
  entries: DomainEntry[];
};

/** Forme historique (version 1) — n'existe plus qu'en entrée de migration. */
export type DomainEntryV1 = Omit<DomainEntry, 'category' | 'source'> & {
  tags?: string[];
};

export type DomainsConfigV1 = {
  version: number;
  defaults: DomainDefaults;
  entries: DomainEntryV1[];
};
