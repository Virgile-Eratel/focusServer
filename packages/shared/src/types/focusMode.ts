export const FocusModeEnum = {
  blocked: "blocked",
  unblocked: "unblocked",
  unknown: "unknown",
} as const;

export type FocusMode = keyof typeof FocusModeEnum;

