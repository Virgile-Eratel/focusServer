import http from 'http';
import app from './app';
import 'dotenv/config';
import { DEFAULT_CHECK_INTERVAL_MS, DEFAULT_HOST, DEFAULT_PORT } from './utils/constants';
import { tick } from './services/focus.service';
import { syncSystemFilesIfChanged } from './services/domain.service';
import { createChildLogger } from './utils/logger';

const log = createChildLogger('server');

const server = http.createServer(app);
const port = Number(process.env.PORT) || DEFAULT_PORT;

/**
 * Boucle unique du serveur, toutes les CHECK_INTERVAL_MS :
 * 1. domains.json a-t-il changé ? → régénère les fichiers système et applique
 * 2. le planning impose-t-il un autre mode ? → applique
 */
async function loop(): Promise<void> {
  await syncSystemFilesIfChanged();
  await tick();
}

server.listen({ port: port, host: process.env.HOST ?? DEFAULT_HOST }, () => {
  log.info({ port }, 'FocusServer running');
  const interval = process.env.CHECK_INTERVAL_MS ? Number(process.env.CHECK_INTERVAL_MS) : DEFAULT_CHECK_INTERVAL_MS;
  void loop();
  setInterval(() => void loop(), interval);
});
