import { FocusMode } from './types/focusMode';

// GET /health
export type HealthResponse = {
  message: string;
};

// GET focus/status
export type FocusStatusResponse = {
  mode: FocusMode;
  isScheduledPause: boolean;
  time: string;
};

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
