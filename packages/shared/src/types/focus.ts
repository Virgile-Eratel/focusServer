import { FocusMode } from './focusMode';

export type ApplicableFocusMode = Exclude<FocusMode, 'unknown'>;
export type RuntimeFocusMode = FocusMode;

/** Prochain basculement du mode, déduit du planning. `at` est une date ISO 8601. */
export type ScheduledTransition = {
  mode: ApplicableFocusMode;
  at: string;
};

export type FocusStatus = {
  mode: FocusMode;
  isScheduledPause: boolean;
  time: string;
  /** `null` quand le planning ne change jamais d'état. */
  nextTransition: ScheduledTransition | null;
};
