import { FocusMode } from "./types/focusMode";

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
