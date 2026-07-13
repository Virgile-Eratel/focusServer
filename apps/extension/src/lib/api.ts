import { createFocusApiClient } from '@focus/api-client';

/**
 * Whitelisté en CORS côté serveur (ALLOWED_ORIGINS) et dans host_permissions.
 * Source unique de l'origine serveur pour popup, pages et service worker.
 */
export const API_BASE_URL = 'http://localhost:5959';

/** Un seul client pour toute l'extension. Aucun cache : chaque appel touche le serveur. */
export const api = createFocusApiClient({ baseUrl: API_BASE_URL });
