import express from 'express';
import { createCorsMiddleware } from './middleware/cors';
import { createRoutes } from './routes';

export function createApp(deps: {
  allowedOrigins: string[];
  routesDeps: Parameters<typeof createRoutes>[0];
}) {
  const app = express();

  app.use(createCorsMiddleware(deps.allowedOrigins));
  app.use(express.json());

  app.use(createRoutes(deps.routesDeps));

  return app;
}
