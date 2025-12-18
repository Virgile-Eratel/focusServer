import dayjs from '../utils/dayjs';
import type { FocusMode, FocusRuntimeMode, FocusStatus, ManualPauseQuota } from '../models/focus';
import { createPauseLimitReachedError } from '../models/errors';
import type { PauseQuotaService } from './pauseQuotaService';
import type { ScheduleService } from './scheduleService';
import type { FocusApplier } from './focusApplier';

export type FocusService = {
  tick: () => Promise<void>;
  getStatus: () => FocusStatus;
  requestPause: (durationMinutesRaw: unknown) => Promise<{
    status: 'paused';
    grantedMinutes: number;
    manualPauseUntil: string;
    manualPauseQuota: ManualPauseQuota;
  }>;
  resume: () => Promise<{ status: 'resumed'; manualPauseUntil: null }>;
};

export function createFocusService(deps: {
  scheduleService: ScheduleService;
  pauseQuotaService: PauseQuotaService;
  applier: FocusApplier;
}): FocusService {
  let currentMode: FocusRuntimeMode = 'unknown';
  let manualPauseUntil: number | null = null;
  let manualPauseStartedAt: number | null = null;

  let isApplying = false;
  let pendingTarget: FocusMode | null = null;

  function calculateTargetMode(): FocusMode {
    const now = Date.now();

    if (manualPauseUntil) {
      if (manualPauseUntil > now) return 'unblocked';

      // Pause expired: account usage up to the planned end.
      if (manualPauseStartedAt) {
        deps.pauseQuotaService.addUsage(manualPauseStartedAt, manualPauseUntil);
      }
      manualPauseUntil = null;
      manualPauseStartedAt = null;
    }

    if (deps.scheduleService.isScheduledPause()) {
      return 'unblocked';
    }

    return 'blocked';
  }

  async function applyMode(targetMode: FocusMode) {
    if (targetMode === currentMode) return;

    // Avoid concurrent sudo calls; keep only the latest desired state.
    if (isApplying) {
      pendingTarget = targetMode;
      return;
    }

    isApplying = true;
    console.log(`🔄 Changement d'état : ${currentMode} -> ${targetMode}`);

    try {
      await deps.applier.apply(targetMode);
      currentMode = targetMode;
      console.log(`✅ Mode appliqué : ${targetMode}`);
    } catch (error) {
      const e = error as Error;
      console.error(`❌ Erreur script: ${e.message}`);
    } finally {
      isApplying = false;
      const pending = pendingTarget;
      pendingTarget = null;
      if (pending && pending !== currentMode) {
        // fire and forget
        void applyMode(pending);
      }
    }
  }

  async function tick() {
    const target = calculateTargetMode();
    await applyMode(target);
  }

  function formatQuota(nowMs: number): ManualPauseQuota {
    const limitMinutes = deps.pauseQuotaService.getDailyPauseLimitMinutes(nowMs);
    const usedMs = deps.pauseQuotaService.getDailyPauseUsedMs(nowMs);
    const remainingMs = deps.pauseQuotaService.getDailyPauseRemainingMs(nowMs);

    return {
      limitMinutes,
      usedMinutes: Math.floor(usedMs / 60000),
      remainingMinutes: Math.floor(remainingMs / 60000),
    };
  }

  function getStatus(): FocusStatus {
    const formattedManualPause = manualPauseUntil ? dayjs(manualPauseUntil).format('HH:mm:ss') : null;
    const now = Date.now();

    return {
      mode: currentMode,
      manualPauseUntil: formattedManualPause,
      isScheduledPause: deps.scheduleService.isScheduledPause(),
      manualPauseQuota: formatQuota(now),
      time: dayjs().format('HH:mm:ss'),
    };
  }

  async function requestPause(durationMinutesRaw: unknown) {
    const requestedMinutes = Math.max(0, Number(durationMinutesRaw ?? 15) || 0);
    const now = Date.now();

    // If currently paused, close the current pause usage up to "now" before starting a new one.
    if (manualPauseUntil && manualPauseStartedAt) {
      deps.pauseQuotaService.addUsage(manualPauseStartedAt, Math.min(now, manualPauseUntil));
      manualPauseUntil = null;
      manualPauseStartedAt = null;
    }

    const remainingMs = deps.pauseQuotaService.getDailyPauseRemainingMs(now);
    const requestedMs = requestedMinutes * 60 * 1000;
    const grantedMs = Math.min(requestedMs, remainingMs);

    if (grantedMs <= 0) {
      const quota = formatQuota(now);
      throw createPauseLimitReachedError(
        `Limite de pause atteinte pour aujourd'hui (${deps.pauseQuotaService.getDailyPauseLimitMinutes(now)} min).`,
        { ...quota, remainingMinutes: 0 },
      );
    }

    manualPauseStartedAt = now;
    manualPauseUntil = now + grantedMs;
    console.log(
      `⏸️  Pause manuelle demandée : ${requestedMinutes} min, accordée : ${Math.floor(grantedMs / 60000)} min`,
    );

    await tick();

    return {
      status: 'paused' as const,
      grantedMinutes: Math.floor(grantedMs / 60000),
      manualPauseUntil: dayjs(manualPauseUntil).format('HH:mm:ss'),
      manualPauseQuota: formatQuota(now),
    };
  }

  async function resume() {
    const now = Date.now();

    if (manualPauseUntil && manualPauseStartedAt) {
      deps.pauseQuotaService.addUsage(manualPauseStartedAt, Math.min(now, manualPauseUntil));
    }

    manualPauseUntil = null;
    manualPauseStartedAt = null;
    console.log('▶️  Fin de pause manuelle (Resume)');

    await tick();

    return { status: 'resumed' as const, manualPauseUntil: null as null };
  }

  return { tick, getStatus, requestPause, resume };
}
