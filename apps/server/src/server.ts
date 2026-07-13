// dotenv AVANT tout le reste : les services (verdict, ollama…) lisent leurs
// variables d'environnement au chargement du module.
import 'dotenv/config';
import http from 'http';
import app from './app';
import { DEFAULT_CHECK_INTERVAL_MS, DEFAULT_HOST, DEFAULT_PORT } from './utils/constants';
import { tick } from './services/focus.service';
import { migrateDomainsFileIfNeeded, syncSystemFilesIfChanged } from './services/domain.service';
import { retryUnknownVerdicts } from './services/classifier.service';
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

/** Laisse à Ollama le temps de démarrer après login avant de retenter les `unknown`. */
const RETRY_UNKNOWN_DELAY_MS = 10_000;

server.listen({ port: port, host: process.env.HOST ?? DEFAULT_HOST }, () => {
  log.info({ port }, 'FocusServer running');
  const interval = process.env.CHECK_INTERVAL_MS ? Number(process.env.CHECK_INTERVAL_MS) : DEFAULT_CHECK_INTERVAL_MS;
  void (async () => {
    // Migration v1 → v2 avant la première synchro : le fichier réécrit est
    // celui que la boucle hashera.
    await migrateDomainsFileIfNeeded().catch((err: Error) => log.error({ err }, 'domains.json migration failed'));
    // La boucle périodique doit s'installer même si le premier tour échoue.
    await loop().catch((err: Error) => log.error({ err }, 'Initial loop failed'));
    setInterval(() => void loop(), interval);
  })();
  setTimeout(() => {
    retryUnknownVerdicts().catch((err: Error) => log.error({ err }, 'Unknown verdicts retry failed'));
  }, RETRY_UNKNOWN_DELAY_MS);
});
