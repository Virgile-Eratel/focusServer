/**
 * Les trois catégories de la politique de blocage. Une catégorie n'existe que
 * pour porter une politique différente (spec §3.1) :
 *   adult          → bloqué toujours, aucune pause.
 *   entertainment  → bloqué selon WEEKLY_SCHEDULE.
 *   other          → jamais bloqué.
 */
export const CATEGORIES = ['adult', 'entertainment', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Catégorie d'un verdict persisté. `unknown` = « on n'a pas su » : Ollama
 * indisponible, page illisible ou muette, nom de domaine inconnu du modèle.
 *
 * `unknown` ne bloque PAS (spec §3.5 révisée) : bloquer, c'est savoir. Le
 * verdict reste en base et sera re-tenté plus tard (§5.2) — l'ignorance est
 * enregistrée telle quelle, elle n'est jamais blanchie en `other`.
 */
export type VerdictCategory = Category | 'unknown';

/** Origine d'une entrée de blocklist ou d'un verdict. */
export type DomainSource = 'manual' | 'ollama';

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
