import type { ManualPauseQuota } from './focus';

// GET /health
export type HealthResponse = {
  status: 'ok';
};

// POST /pause (success)
export type PauseResponse = {
  status: 'paused';
  grantedMinutes: number;
  manualPauseUntil: string;
  manualPauseQuota: ManualPauseQuota;
};

// POST /pause (429 - quota exceeded)
export type PauseLimitReachedResponse = {
  status: 'pause_limit_reached';
  message: string;
  manualPauseQuota: ManualPauseQuota;
};

// POST /resume
export type ResumeResponse = {
  status: 'resumed';
  manualPauseUntil: null;
};

// Union type for pause endpoint
export type PauseResult = PauseResponse | PauseLimitReachedResponse;

