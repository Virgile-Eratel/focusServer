import { createFocusApiClient } from '@focus/api-client';

/** Whitelisté en CORS côté serveur (ALLOWED_ORIGINS) et dans host_permissions. */
export const API_BASE_URL = 'http://localhost:5959';

/** Un seul client pour tout le popup. Aucun cache : chaque appel touche le serveur. */
export const api = createFocusApiClient({ baseUrl: API_BASE_URL });
