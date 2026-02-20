import express, { Router } from "express";
import * as focusController from "../controllers/focus.controller";

const router: Router = express.Router();


router.get('/status', focusController.getStatus);
router.get('/domains', focusController.getDomains);

export default router;
