import { ApplicableFocusMode, FocusStatus, RuntimeFocusMode } from '@focus/shared/src/types/focus';
import { FocusModeEnum } from '@focus/shared/src/types/focusMode';
import dayjs from '../utils/dayjs';
import { apply } from './focusApplier.service';
import { getNextTransitionFromNow, isScheduledPause } from './scheduleService';
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
 *
 * Retourne `true` si la machine reflète bien `targetMode` en sortie, `false`
 * si l'application a été abandonnée (déjà en cours) ou a échoué. L'appelant
 * doit alors considérer que /etc n'est PAS à jour et retenter.
 */
export async function applyMode(
  targetMode: ApplicableFocusMode,
  { force = false, reason }: { force?: boolean; reason?: string } = {},
): Promise<boolean> {
  if (!force && targetMode === currentMode) return true;

  if (isApplying) {
    log.warn({ targetMode, force }, 'applyMode skipped — already applying');
    return false;
  }

  isApplying = true;
  log.info({ mode: targetMode, force, reason }, 'Applying mode');

  try {
    await apply(targetMode);
    currentMode = targetMode;
    log.info({ mode: targetMode }, 'Apply completed');
    return true;
  } catch (error) {
    // Non-fatal : domains.json et les fichiers système sont déjà à jour.
    // Le prochain tick() retentera l'application (≤ 60s).
    const e = error as Error;
    log.error({ err: e }, 'Apply failed');
    return false;
  } finally {
    isApplying = false;
  }
}

export async function tick() {
  const target = calculateTargetMode();
  await applyMode(target);
}

export function getStatusService(): FocusStatus {
  const next = getNextTransitionFromNow();

  return {
    mode: currentMode,
    isScheduledPause: isScheduledPause(),
    time: dayjs().format('HH:mm:ss'),
    nextTransition: next ? { mode: next.mode, at: next.at.toISOString() } : null,
  };
}
