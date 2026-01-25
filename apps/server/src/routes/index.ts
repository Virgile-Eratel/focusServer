import express, { Router } from "express";
import focusRouter from './focus.routes';

const router: Router = express.Router();

router.use('/focus', focusRouter);

export default router;