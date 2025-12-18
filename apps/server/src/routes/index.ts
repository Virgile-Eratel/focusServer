import { Router } from 'express';
import type { HealthController } from '../controllers/healthController';
import type { FocusController } from '../controllers/focusController';
import { createFocusRoutes } from './focusRoutes';

export function createRoutes(deps: { healthController: HealthController; focusController: FocusController }) {
  const router = Router();

  router.get('/health', deps.healthController.getHealth);
  router.use(createFocusRoutes(deps.focusController));

  return router;
}
