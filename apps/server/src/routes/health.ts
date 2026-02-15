import { HealthResponse } from '@focus/shared';
import express, { Request, Response } from 'express';

const router = express.Router();

const health = router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({ message: 'API OK' } as HealthResponse);
});

export default health;
