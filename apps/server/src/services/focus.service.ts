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

export function calculateTargetMode(): ApplicableFocusMode {
  if (isScheduledPause()) {
    return FocusModeEnum.unblocked;
  }

  return FocusModeEnum.blocked;
}

/**
 * Applique le mode cible. Si force=true, contourne le guard
 * targetMode === currentMode — utilisé après modification de la
 * liste de domaines (les fichiers système ont changé).
 */
export async function applyMode(
  targetMode: ApplicableFocusMode,
  { force = false, reason }: { force?: boolean; reason?: string } = {},
): Promise<void> {
  if (!force && targetMode === currentMode) return;

  if (isApplying) {
    log.warn({ targetMode, force }, 'applyMode skipped — already applying');
    return;
  }

  isApplying = true;
  log.info({ mode: targetMode, force, reason }, 'Applying mode');

  try {
    await apply(targetMode);
    currentMode = targetMode;
    log.info({ mode: targetMode }, 'Apply completed');
  } catch (error) {
    // Non-fatal : le domaine est persisté dans domains.json et sera
    // appliqué au prochain tick() (≤ 60s).
    const e = error as Error;
    log.error({ err: e }, 'Apply failed');
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
