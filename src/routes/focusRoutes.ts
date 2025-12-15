import { Router } from 'express';
import type { FocusController } from '../controllers/focusController';

export function createFocusRoutes(focusController: FocusController) {
  const router = Router();

  router.get('/status', focusController.getStatus);
  router.post('/pause', focusController.pause);
  router.post('/resume', focusController.resume);

  return router;
}
