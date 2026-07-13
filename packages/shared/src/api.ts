import type { FocusStatus } from './types/focus';
import type { Category, DomainSource, VerdictCategory } from './types/category';

// GET /health
export type HealthResponse = {
  message: string;
};

// GET focus/status
// Même forme que l'état interne du serveur — une seule définition, pas de copie.
// La prochaine transition est typée `ScheduledTransition` (voir ./types/focus).
export type FocusStatusResponse = FocusStatus;

// GET focus/domains
export type DomainsResponse = {
  domains: string[];
};

// POST focus/domains — Ajouter un domaine
export type AddDomainRequest = {
  domain: string;
  /** Défaut côté serveur : `entertainment`. */
  category?: Category;
};

export type AddDomainResponse = {
  success: boolean;
  entry: DomainEntryResponse;
  expandedDomains: string[];
};

// DELETE focus/domains/:domain — Supprimer un domaine
export type RemoveDomainResponse = {
  success: boolean;
  expandedDomains: string[];
};

// GET focus/domains/entries — Entrées brutes (non expansées)
export type DomainEntryResponse = {
  domain: string;
  category: Category;
  source: DomainSource;
};

export type DomainEntriesResponse = {
  entries: DomainEntryResponse[];
};

// POST focus/classify — Classifier un domaine inconnu (spec §7.4)
export type ClassifyRequest = {
  url: string;
};

export type ClassifyResponse = {
  /** Domaine enregistrable (eTLD+1) extrait de l'URL. */
  domain: string;
  category: VerdictCategory;
  /** Verdict appliqué maintenant. `unknown` ⇒ `false` : on ne bloque pas sans savoir. */
  blocked: boolean;
  /** `manual` = présent dans domains.json, `ollama` = verdict IA. */
  source: DomainSource;
};

// GET focus/verdicts/recent — Revue à froid des verdicts (faux positifs)
export type VerdictResponse = {
  domain: string;
  category: VerdictCategory;
  source: DomainSource;
  decidedAt: string;
  /** Titre/métas ayant servi au verdict, pour débogage. */
  evidence: string | null;
};

export type RecentVerdictsResponse = {
  verdicts: VerdictResponse[];
};

// DELETE focus/verdicts/:domain — Effacer un verdict (re-classification à la prochaine visite)
export type DeleteVerdictResponse = {
  success: boolean;
};
