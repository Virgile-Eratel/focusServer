import { ApplicableFocusMode, FocusStatus, RuntimeFocusMode } from '@focus/shared/src/types/focus';
import { FocusModeEnum } from '@focus/shared/src/types/focusMode';
import dayjs from '../utils/dayjs';
import { apply } from './focusApplier.service';
import { isScheduledPause } from './scheduleService';


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
  console.log(`Switching mode: ${currentMode} -> ${targetMode}`);

  try {
    await apply(targetMode);
    currentMode = targetMode;
    console.log(`Mode set to: ${targetMode}`);
  } catch (error) {
    const e = error as Error;
    console.error(`Error applying mode: ${e.message}`);
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