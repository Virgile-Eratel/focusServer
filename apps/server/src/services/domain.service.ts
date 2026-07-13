import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import type { DomainEntryResponse } from '@focus/shared';
import type { DomainEntry, DomainsConfig } from '../types/domains';
import { normalizeHostname } from '../utils/hostname';
import { writeFileAtomic } from '../utils/atomicWrite';
import { DEFAULT_DOMAINS_PATH, DEFAULT_SYSTEM_DIR } from '../utils/constants';
import { createChildLogger } from '../utils/logger';
import { assertSupportedVersion, expandDomainEntries, generateSystemFiles } from './systemConfig.service';
import { applyMode, calculateTargetMode } from './focus.service';

const log = createChildLogger('domain');

/**
 * `config/domains.json` (dans le projet) est l'unique source de vérité.
 * Il n'est jamais copié ailleurs : les fichiers système en sont dérivés.
 *
 * Aucun cache mémoire — le fichier est relu à chaque lecture. Il fait quelques
 * kilo-octets et n'est lu qu'au tick (60s) ou sur requête de l'extension : le
 * coût est négligeable, et une donnée périmée devient impossible.
 */
const DOMAINS_PATH = process.env.DOMAINS_PATH || DEFAULT_DOMAINS_PATH;

/** Répertoire des fichiers générés, lus ensuite par focus-apply.sh. */
const SYSTEM_DIR = process.env.FOCUS_SYSTEM_DIR || DEFAULT_SYSTEM_DIR;

// --- Lecture ---

function parseConfig(raw: string): DomainsConfig {
  const config = JSON.parse(raw) as DomainsConfig;
  assertSupportedVersion(config);
  return config;
}

function readConfig(): { raw: string; config: DomainsConfig } {
  const raw = readFileSync(DOMAINS_PATH, 'utf-8');
  return { raw, config: parseConfig(raw) };
}

/** Tous les hostnames bloqués, alias et variantes www/m comprises. */
export function getExpandedDomains(): string[] {
  return expandDomainEntries(readConfig().config);
}

/** Les entrées telles qu'écrites dans le fichier (sans expansion). */
export function getDomainEntries(): DomainEntryResponse[] {
  return readConfig().config.entries.map((entry) => ({
    domain: entry.domain,
    tags: entry.tags ?? [],
  }));
}

// --- Synchronisation domains.json → fichiers système ---

/**
 * Empreinte du contenu déjà propagé vers les fichiers système.
 * `null` = rien n'a encore été synchronisé (démarrage, ou échec précédent
 * qu'il faut retenter).
 */
let lastSyncedHash: string | null = null;

function hashOf(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Régénère hosts.blocked + pf.user.conf.template, puis applique si le blocage
 * est actif. Le `force` est indispensable : le mode n'a pas changé, ce sont les
 * fichiers qui ont changé — sans lui, focus-apply.sh ne serait pas rappelé.
 */
async function regenerate(raw: string, reason: string): Promise<void> {
  const config = parseConfig(raw);

  generateSystemFiles(config, SYSTEM_DIR);
  log.info({ reason, entries: config.entries.length }, 'System files regenerated');

  // En mode unblocked, les fichiers générés ne sont pas encore utilisés :
  // rien à appliquer, la synchro est complète.
  if (calculateTargetMode() === 'unblocked') {
    lastSyncedHash = hashOf(raw);
    return;
  }

  // L'empreinte n'est enregistrée que si /etc reflète vraiment le fichier.
  // Sinon (apply échoué ou abandonné car déjà en cours), on laisse l'empreinte
  // en l'état pour que le prochain tick retente — sans quoi une application
  // manquée resterait invisible jusqu'au prochain changement de mode.
  const applied = await applyMode('blocked', { force: true, reason });
  if (applied) {
    lastSyncedHash = hashOf(raw);
  } else {
    log.warn({ reason }, 'Apply did not complete — will retry on next tick');
  }
}

/**
 * Appelé à chaque tick. Détecte toute modification de domains.json — y compris
 * une édition manuelle à l'éditeur de texte — et la propage vers la machine.
 * Au démarrage l'empreinte est inconnue, donc une synchro a toujours lieu : les
 * fichiers système reflètent forcément le JSON dès que le serveur tourne.
 */
export async function syncSystemFilesIfChanged(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(DOMAINS_PATH, 'utf-8');
  } catch (error) {
    log.error({ err: error as Error, path: DOMAINS_PATH }, 'Cannot read domains.json');
    return;
  }

  if (hashOf(raw) === lastSyncedHash) return;

  const reason = lastSyncedHash === null ? 'startup' : 'domains.json changed';
  try {
    await regenerate(raw, reason);
  } catch (error) {
    // Non fatal (JSON invalide, écriture impossible…). L'empreinte n'ayant pas
    // été mise à jour, le prochain tick retentera.
    log.error({ err: error as Error }, 'Sync failed — will retry on next tick');
  }
}

// --- Écriture (verrou : une seule modification à la fois) ---

const WRITE_LOCK_TIMEOUT_MS = 30_000;

let writePromise: Promise<void> | null = null;

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  if (writePromise) {
    await Promise.race([
      writePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Write lock timeout (30s)')), WRITE_LOCK_TIMEOUT_MS),
      ),
    ]);
  }

  let resolve: () => void;
  writePromise = new Promise<void>((r) => (resolve = r));
  try {
    return await fn();
  } finally {
    writePromise = null;
    resolve!();
  }
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Modifie domains.json puis propage vers la machine.
 * Si la génération échoue, le fichier est restauré et la prochaine synchro est
 * forcée — les fichiers système ont pu rester à moitié à jour.
 */
async function updateConfig(
  reason: string,
  mutate: (config: DomainsConfig) => void,
): Promise<{ expandedDomains: string[] }> {
  // Relecture disque à l'intérieur du verrou : le fichier a pu changer entre-temps.
  const { raw: previousRaw, config } = readConfig();

  mutate(config);

  const nextRaw = JSON.stringify(config, null, 2) + '\n';
  writeFileAtomic(DOMAINS_PATH, nextRaw);

  try {
    await regenerate(nextRaw, reason);
  } catch (error) {
    writeFileAtomic(DOMAINS_PATH, previousRaw);
    lastSyncedHash = null; // force une resynchro complète au prochain tick
    log.error({ err: error as Error }, 'Failed to regenerate system config, rolled back');
    throw new Error('Failed to regenerate system config');
  }

  return { expandedDomains: expandDomainEntries(config) };
}

export async function addDomain(
  domain: string,
  tags?: string[],
): Promise<{ entry: DomainEntryResponse; expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) throw httpError('Invalid domain format', 400);

  return withWriteLock(async () => {
    const newEntry: DomainEntry = { domain: normalized };
    if (tags && tags.length > 0) newEntry.tags = tags;

    const { expandedDomains } = await updateConfig('domain added', (config) => {
      if (config.entries.some((entry) => entry.domain === normalized)) {
        throw httpError('Domain already exists', 409);
      }
      config.entries.push(newEntry);
    });

    log.info({ domain: normalized }, 'Domain added');
    return { entry: { domain: normalized, tags: newEntry.tags ?? [] }, expandedDomains };
  });
}

export async function removeDomain(domain: string): Promise<{ expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) throw httpError('Invalid domain format', 400);

  return withWriteLock(async () => {
    const { expandedDomains } = await updateConfig('domain removed', (config) => {
      const index = config.entries.findIndex((entry) => entry.domain === normalized);
      if (index === -1) throw httpError('Domain not found', 404);
      config.entries.splice(index, 1);
    });

    log.info({ domain: normalized }, 'Domain removed');
    return { expandedDomains };
  });
}
