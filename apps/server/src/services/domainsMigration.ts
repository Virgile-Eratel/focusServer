import type { Category } from '@focus/shared';
import { isCategory } from '@focus/shared';
import { DOMAINS_CONFIG_VERSION, type DomainEntry, type DomainsConfig, type DomainsConfigV1 } from '../types/domains';

/**
 * Migration domains.json v1 → v2 : `tags[]` devient `category` (spec §5.1).
 *
 * Le multi-tag était une fiction — seul tags[0] était lu. La correspondance :
 *   adult          → adult
 *   social, video  → entertainment
 *   tout le reste  → other
 *
 * Toute entrée migrée est `source: 'manual'` : elle a été écrite par un humain.
 *
 * ⚠️ En v1, TOUTE entrée était bloquée quel que soit son tag ; une entrée
 * migrée vers `other` cesse de l'être. Ce cas est remonté dans `warnings`
 * pour être loggé — jamais silencieux.
 */

const V1_TAG_TO_CATEGORY: Record<string, Category> = {
  adult: 'adult',
  social: 'entertainment',
  video: 'entertainment',
};

function categoryFromTags(tags: string[] | undefined): Category {
  const tag = tags?.[0];
  return (tag && V1_TAG_TO_CATEGORY[tag]) || 'other';
}

export function migrateV1ToV2(config: DomainsConfigV1): DomainsConfig {
  return {
    ...config,
    version: DOMAINS_CONFIG_VERSION,
    entries: config.entries.map((entry): DomainEntry => {
      const { tags, ...rest } = entry;
      return { ...rest, category: categoryFromTags(tags), source: 'manual' };
    }),
  };
}

export type MigrationResult = {
  config: DomainsConfig;
  migrated: boolean;
  /** Anomalies corrigées automatiquement — à logger par l'appelant. */
  warnings: string[];
};

/**
 * Une entrée v2 sans `category` valide serait silencieusement absente de tous
 * les fichiers générés (donc jamais bloquée) — le piège classique de l'édition
 * à la main. On normalise fail closed : catégorie manquante/inconnue devient
 * `entertainment` (bloquée en mode focus), avec un avertissement.
 */
function normalizeV2Entries(config: DomainsConfig): { config: DomainsConfig; warnings: string[] } {
  const warnings: string[] = [];
  const entries = config.entries.map((entry) => {
    let normalized = entry;
    if (!isCategory(entry.category)) {
      warnings.push(`Entry "${entry.domain}" has no valid category — defaulting to "entertainment" (fail closed)`);
      normalized = { ...normalized, category: 'entertainment' };
    }
    if (normalized.source !== 'manual' && normalized.source !== 'ollama') {
      normalized = { ...normalized, source: 'manual' };
    }
    return normalized;
  });
  return { config: warnings.length ? { ...config, entries } : config, warnings };
}

/**
 * Accepte un JSON parsé en version 1 (migré en mémoire) ou 2 (normalisé),
 * rejette toute autre version. Valide aussi la présence des `entries`.
 */
export function migrateConfig(parsed: unknown): MigrationResult {
  const candidate = parsed as { version?: unknown; entries?: unknown };
  if (!candidate || !Array.isArray(candidate.entries)) {
    throw new Error('Invalid domains.json: "entries" must be an array');
  }

  if (candidate.version === 1) {
    const v1 = parsed as DomainsConfigV1;
    const migrated = migrateV1ToV2(v1);
    const warnings = migrated.entries
      .filter((entry) => entry.category === 'other')
      .map((entry) => `Entry "${entry.domain}" was blocked in v1 but migrates to "other" (never blocked)`);
    return { config: migrated, migrated: true, warnings };
  }
  if (candidate.version === DOMAINS_CONFIG_VERSION) {
    const { config, warnings } = normalizeV2Entries(parsed as DomainsConfig);
    return { config, migrated: false, warnings };
  }
  throw new Error(`Unsupported domains.json version: ${candidate.version}`);
}
