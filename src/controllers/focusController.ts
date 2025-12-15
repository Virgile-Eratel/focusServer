import type { Request, Response } from 'express';
import { isPauseLimitReachedError } from '../models/errors';
import type { FocusService } from '../services/focusService';

export type FocusController = {
  getStatus: (_req: Request, res: Response) => void;
  pause: (req: Request, res: Response) => Promise<Response | void>;
  resume: (_req: Request, res: Response) => Promise<Response | void>;
};

export function createFocusController(focusService: FocusService): FocusController {
  function getStatus(_req: Request, res: Response) {
    res.json(focusService.getStatus());
  }

  async function pause(req: Request, res: Response) {
    try {
      const result = await focusService.requestPause(req.body?.durationMinutes);
      return res.json(result);
    } catch (error) {
      if (isPauseLimitReachedError(error)) {
        return res.status(429).json({
          status: 'pause_limit_reached',
          message: error.message,
          manualPauseQuota: error.quota,
        });
      }

      const e = error as Error;
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  async function resume(_req: Request, res: Response) {
    const result = await focusService.resume();
    return res.json(result);
  }

  return { getStatus, pause, resume };
}
