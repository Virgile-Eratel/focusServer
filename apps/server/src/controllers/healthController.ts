import type { Request, Response } from 'express';

export type HealthController = {
  getHealth: (_req: Request, res: Response) => void;
};

export function createHealthController(): HealthController {
  function getHealth(_req: Request, res: Response) {
    res.json({ status: 'ok' });
  }

  return { getHealth };
}
