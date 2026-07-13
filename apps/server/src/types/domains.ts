/**
 * Types de `config/domains.json` — l'unique source de vérité de la blocklist.
 *
 * Le fichier du projet est lu à chaque besoin (aucun cache mémoire) et
 * régénère les fichiers système via `systemConfig.service`.
 */

export const DOMAINS_CONFIG_VERSION = 1;

export type DomainEntry = {
  domain: string;
  aliases?: string[];
  tags?: string[];
  includeWww?: boolean;
  includeMobile?: boolean;
  /** Inclure ce domaine dans hosts.blocked (défaut: true) */
  hosts?: boolean;
  /** Inclure ce domaine dans pf.user.conf.template (défaut: true) */
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
