import { NextFunction, Request, Response } from 'express';

const notFoundMiddleware = (_req: Request, res: Response, _next: NextFunction) =>
  res.status(404).json({ message: 'Not Found' });


export default notFoundMiddleware;