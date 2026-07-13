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

// --- Classification (Ollama + fetch de page) ---

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'gemma3:4b';
/** Généreux : le premier appel peut inclure le chargement du modèle. */
export const OLLAMA_TIMEOUT_MS = 20_000;

export const PAGE_FETCH_TIMEOUT_MS = 5_000;
export const PAGE_FETCH_MAX_BYTES = 256 * 1024;
export const PAGE_FETCH_MAX_REDIRECTS = 3;
/** Le texte extrait d'une page est une donnée non fiable : tronqué court. */
export const EVIDENCE_MAX_CHARS = 2_000;

/**
 * Chemin « nom seul » (page illisible ou muette) : on ne peut plus s'appuyer
 * que sur ce que le modèle CROIT savoir. Or il invente — et une invention
 * DÉRIVE d'un tirage à l'autre, là où une connaissance réelle reste stable
 * (mesuré : « crunchyroll » → « anime streaming platform » ×3, contre
 * « motherless » → dating / forum / réseau social, trois fois autre chose).
 * D'où plusieurs tirages, à température non nulle pour les faire diverger.
 */
export const KNOWLEDGE_SAMPLES = 3;
export const KNOWLEDGE_TEMPERATURE = 0.8;

/**
 * En deçà, la page n'a rien dit d'autre que son propre nom de marque
 * (« Tiime », « YouTube ») : ce n'est pas une évidence, c'est un écho.
 */
export const MIN_PAGE_SIGNAL_CHARS = 12;
