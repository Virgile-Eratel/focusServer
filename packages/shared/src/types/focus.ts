import { FocusMode } from "./focusMode";

export type FocusStatus = {
  mode: FocusMode;
  isScheduledPause: boolean;
  time: string;
};

export type ApplicableFocusMode = Exclude<FocusMode, 'unknown'>;
export type RuntimeFocusMode = FocusMode;