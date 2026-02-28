import { ApplicableFocusMode, FocusStatus, RuntimeFocusMode } from '@focus/shared/src/types/focus';
import { FocusModeEnum } from '@focus/shared/src/types/focusMode';
import dayjs from '../utils/dayjs';
import { apply } from './focusApplier.service';
import { isScheduledPause } from './scheduleService';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('focus');

let currentMode: RuntimeFocusMode = FocusModeEnum.unknown;
let isApplying = false;

export const getCurrentMode = () => currentMode;

function calculateTargetMode(): ApplicableFocusMode {
  if (isScheduledPause()) {
    return FocusModeEnum.unblocked;
  }

  return FocusModeEnum.blocked;
}

async function applyMode(targetMode: ApplicableFocusMode) {
  if (targetMode === currentMode) return;

  if (isApplying) {
    return;
  }

  isApplying = true;
  log.info({ from: currentMode, to: targetMode }, 'Switching mode');

  try {
    await apply(targetMode);
    currentMode = targetMode;
    log.info({ mode: targetMode }, 'Mode applied');
  } catch (error) {
    const e = error as Error;
    log.error({ err: e }, 'Failed to apply mode');
  } finally {
    isApplying = false;
  }
}

export async function tick() {
  const target = calculateTargetMode();
  await applyMode(target);
}

export function getStatusService(): FocusStatus {
  return {
    mode: currentMode,
    isScheduledPause: isScheduledPause(),
    time: dayjs().format('HH:mm:ss'),
  };
}
