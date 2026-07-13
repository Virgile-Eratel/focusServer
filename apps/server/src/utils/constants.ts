import path from 'path';

export const DEFAULT_FOCUS_SCRIPT_PATH = '/usr/local/bin/focus-apply.sh';
export const DEFAULT_CHECK_INTERVAL_MS = 60000;
export const DEFAULT_PORT = 5959;
export const DEFAULT_HOST = '127.0.0.1';

/**
 * Source de vérité de la blocklist : le fichier du projet lui-même.
 * Résolu depuis `src/utils` (dev) ou `dist/utils` (prod) → `apps/server/config/domains.json`.
 */
export const DEFAULT_DOMAINS_PATH = path.resolve(__dirname, '../../config/domains.json');

/** Fichiers générés depuis domains.json, lus par focus-apply.sh (root). */
export const DEFAULT_SYSTEM_DIR = '/usr/local/etc/focusServer';
