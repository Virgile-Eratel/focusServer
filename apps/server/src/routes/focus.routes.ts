import express, { Router } from 'express';
import * as focusController from '../controllers/focus.controller';

const router: Router = express.Router();

router.get('/status', focusController.getStatus);
router.get('/domains', focusController.getDomains);
router.get('/domains/entries', focusController.getDomainEntriesController);
router.post('/domains', focusController.addDomain);
router.put('/domains/:domain', focusController.overrideDomain);
router.delete('/domains/:domain', focusController.removeDomain);
router.post('/classify', focusController.classify);
router.get('/verdicts/recent', focusController.getRecentVerdicts);
router.delete('/verdicts/:domain', focusController.deleteVerdictController);

export default router;
