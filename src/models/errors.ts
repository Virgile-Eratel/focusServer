import type { ManualPauseQuota } from './focus';

export type PauseLimitReachedError = Error & {
  name: 'PauseLimitReachedError';
  quota: ManualPauseQuota;
};

export function createPauseLimitReachedError(message: string, quota: ManualPauseQuota): PauseLimitReachedError {
  const err = new Error(message) as PauseLimitReachedError;
  err.name = 'PauseLimitReachedError';
  err.quota = quota;
  return err;
}

export function isPauseLimitReachedError(error: unknown): error is PauseLimitReachedError {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; quota?: unknown };
  return e.name === 'PauseLimitReachedError' && typeof e.quota === 'object' && e.quota !== null;
}
