import { FocusStatusResponse } from "@focus/shared";
import { getStatusService } from "../services/focus.service";
import { Request, Response } from 'express';


export const getStatus = async (_req: Request, res: Response) => {
  try {
    const status = await getStatusService();
    res.status(200).json(status as FocusStatusResponse);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};