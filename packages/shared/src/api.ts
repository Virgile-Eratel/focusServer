import type { FocusStatus } from './types/focus';

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
  tags?: string[];
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
  tags: string[];
};

export type DomainEntriesResponse = {
  entries: DomainEntryResponse[];
};
