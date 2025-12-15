import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { ALLOWED_ORIGINS } from './config/focus';
import { createFocusController } from './controllers/focusController';
import { createHealthController } from './controllers/healthController';
import { createFocusApplier } from './services/focusApplier';
import { createFocusService } from './services/focusService';
import { createPauseQuotaService } from './services/pauseQuotaService';
import { createScheduleService } from './services/scheduleService';

const scheduleService = createScheduleService();
const pauseQuotaService = createPauseQuotaService();
const applier = createFocusApplier(env.focusScriptPath);
const focusService = createFocusService({ scheduleService, pauseQuotaService, applier });

const healthController = createHealthController();
const focusController = createFocusController(focusService);

const app = createApp({
  allowedOrigins: ALLOWED_ORIGINS,
  routesDeps: { healthController, focusController },
});

const server = http.createServer(app);

server.listen({ port: env.port, host: env.host }, () => {
  console.log(`🔒 Focus Server (Secured) running on port ${env.port}`);
  void focusService.tick();
  setInterval(() => void focusService.tick(), env.checkIntervalMs);
});
