import express, { Router } from 'express';
import * as focusController from '../controllers/focus.controller';

const router: Router = express.Router();

router.get('/status', focusController.getStatus);
router.get('/domains', focusController.getDomains);
router.get('/domains/entries', focusController.getDomainEntriesController);
router.post('/domains', focusController.addDomain);
router.delete('/domains/:domain', focusController.removeDomain);

export default router;
