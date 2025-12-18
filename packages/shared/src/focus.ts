export type FocusMode = 'blocked' | 'unblocked';
export type FocusRuntimeMode = FocusMode | 'unknown';

export type ManualPauseQuota = {
  limitMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
};

export type FocusStatus = {
  mode: FocusRuntimeMode;
  manualPauseUntil: string | null;
  isScheduledPause: boolean;
  manualPauseQuota: ManualPauseQuota;
  time: string;
};

export type PauseWindow = { start: string; end: string };

