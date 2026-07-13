import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import type { Category, DomainEntryResponse, DomainSource } from '@focus/shared';
import { isCategory } from '@focus/shared';
import type { DomainEntry, DomainsConfig } from '../types/domains';
import { normalizeHostname } from '../utils/hostname';
import { getRegistrableDomain } from '../utils/registrableDomain';
import { writeFileAtomic } from '../utils/atomicWrite';
import { httpError } from '../utils/httpError';
import { DEFAULT_DOMAINS_PATH, DEFAULT_SYSTEM_DIR } from '../utils/constants';
import { createChildLogger } from '../utils/logger';
import { expandDomainEntries, expandDomainEntriesFor, generateSystemFiles } from './systemConfig.service';
import { migrateConfig } from './domainsMigration';
import { categoriesBlockedDuring } from '../config/categories';
import { applyMode, calculateTargetMode } from './focus.service';
import { isScheduledPause } from './scheduleService';

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

/** Toute lecture tolère un fichier v1 : migration en mémoire, sans écriture. */
function parseConfig(raw: string): DomainsConfig {
  // migrateConfig valide version + entries — pas de double validation ici.
  return migrateConfig(JSON.parse(raw)).config;
}

function readConfig(): { raw: string; config: DomainsConfig } {
  const raw = readFileSync(DOMAINS_PATH, 'utf-8');
  return { raw, config: parseConfig(raw) };
}

/** Tous les hostnames bloqués, alias et variantes www/m comprises. */
export function getExpandedDomains(): string[] {
  return expandDomainEntries(readConfig().config);
}

/**
 * Hostnames expansés des catégories bloquées EN CE MOMENT (politique +
 * planning). C'est ce que l'extension pose en règles DNR — la politique
 * reste entièrement côté serveur.
 *
 * `isPause` peut être fourni par l'appelant pour partager UNE évaluation de
 * l'horloge sur toute une réponse (sinon un /status à cheval sur une bascule
 * pourrait dire « bloqué » dans `categories` et l'inverse dans les hostnames).
 */
export function getBlockedHostnames(isPause: boolean = isScheduledPause()): string[] {
  return expandDomainEntriesFor(readConfig().config, categoriesBlockedDuring(isPause));
}

/** Les entrées telles qu'écrites dans le fichier (sans expansion). */
export function getDomainEntries(): DomainEntryResponse[] {
  return readConfig().config.entries.map((entry) => ({
    domain: entry.domain,
    category: entry.category,
    source: entry.source,
  }));
}

/**
 * L'entrée couvrant ce domaine enregistrable (domaine principal ou alias),
 * comparés par leur propre eTLD+1. Utilisé par le classifieur : un domaine
 * déjà listé ne repasse jamais devant Ollama.
 */
export function findEntryByRegistrableDomain(registrable: string): DomainEntry | null {
  const { config } = readConfig();
  for (const entry of config.entries) {
    const candidates = [entry.domain, ...(entry.aliases ?? [])];
    if (candidates.some((candidate) => getRegistrableDomain(candidate) === registrable)) {
      return entry;
    }
  }
  return null;
}

// --- Migration v1 → v2 du fichier lui-même ---

/**
 * Réécrit domains.json en version 2 s'il est encore en version 1. Appelé une
 * fois au démarrage, avant la première boucle : le serveur est géré par
 * launchd (KeepAlive) — une étape manuelle oubliée serait un crash-loop.
 */
export async function migrateDomainsFileIfNeeded(): Promise<void> {
  let raw: string;
  try {
    raw = readFileSync(DOMAINS_PATH, 'utf-8');
  } catch (error) {
    log.error({ err: error as Error, path: DOMAINS_PATH }, 'Cannot read domains.json');
    return;
  }

  const { config, migrated, warnings } = migrateConfig(JSON.parse(raw));
  for (const warning of warnings) log.warn({ warning }, 'domains.json migration warning');
  if (!migrated) return;

  await withWriteLock(async () => {
    writeFileAtomic(DOMAINS_PATH, JSON.stringify(config, null, 2) + '\n');
  });
  log.info({ entries: config.entries.length }, 'domains.json migrated v1 → v2');
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
 * Régénère les 4 fichiers système puis force l'application du mode courant.
 * Le `force` est indispensable : le mode n'a pas changé, ce sont les fichiers
 * qui ont changé — sans lui, focus-apply.sh ne serait pas rappelé.
 *
 * L'application a lieu dans les DEUX modes : en pause, les fichiers unblocked
 * contiennent les domaines adult — un site adulte classé pendant une pause
 * doit atteindre /etc/hosts immédiatement, pas à la prochaine bascule.
 */
async function regenerate(raw: string, reason: string): Promise<void> {
  const { config, warnings } = migrateConfig(JSON.parse(raw));
  for (const warning of warnings) log.warn({ warning }, 'domains.json warning');

  generateSystemFiles(config, SYSTEM_DIR);
  log.info({ reason, entries: config.entries.length }, 'System files regenerated');

  // L'empreinte n'est enregistrée que si /etc reflète vraiment le fichier.
  // Sinon (apply échoué ou abandonné car déjà en cours), on laisse l'empreinte
  // en l'état pour que le prochain tick retente — sans quoi une application
  // manquée resterait invisible jusqu'au prochain changement de mode.
  const applied = await applyMode(calculateTargetMode(), { force: true, reason });
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
  category: Category = 'entertainment',
  source: DomainSource = 'manual',
): Promise<{ entry: DomainEntryResponse; expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) throw httpError('Invalid domain format', 400);
  if (!isCategory(category)) throw httpError('Invalid category', 400);

  return withWriteLock(async () => {
    const newEntry: DomainEntry = { domain: normalized, category, source };

    const { expandedDomains } = await updateConfig('domain added', (config) => {
      if (config.entries.some((entry) => entry.domain === normalized)) {
        throw httpError('Domain already exists', 409);
      }
      config.entries.push(newEntry);
    });

    log.info({ domain: normalized, category, source }, 'Domain added');
    return { entry: { domain: normalized, category, source }, expandedDomains };
  });
}

/**
 * Corriger une erreur de l'IA — la seule soupape ouverte au navigateur, et
 * elle est ASYMÉTRIQUE.
 *
 * Le problème que ça règle : l'IA se trompe (un SaaS de compta rangé en
 * « divertissement »), et l'utilisateur ne peut pas le corriger depuis
 * l'extension. Il lui faut une issue.
 *
 * Le problème qu'il ne faut PAS créer : cette issue deviendrait la porte de
 * sortie du bloqueur. Au moment où l'on veut débloquer un site, on est
 * exactement la personne qui ne devrait pas décider (§1). D'où deux verrous,
 * appliqués ICI, côté serveur — pas seulement grisés dans l'UI :
 *
 *   - `adult` ne se retire JAMAIS par cette voie. Aucune exception.
 *   - une entrée `manual` non plus : c'est un choix que l'humain a posé à
 *     froid ; le défaire demande d'éditer `domains.json` à la main.
 *
 * Reste donc exactement ce que l'IA a décidé et qui n'est pas de l'adulte :
 * le tort qu'elle peut causer, et rien d'autre. L'entrée corrigée devient
 * `manual` — elle fait autorité, et ne sera plus jamais re-classifiée.
 */
export async function overrideAiDomain(
  domain: string,
  category: Category,
): Promise<{ entry: DomainEntryResponse; expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) throw httpError('Invalid domain format', 400);
  if (!isCategory(category)) throw httpError('Invalid category', 400);

  return withWriteLock(async () => {
    const { expandedDomains } = await updateConfig('ai verdict overridden', (config) => {
      const index = config.entries.findIndex((entry) => entry.domain === normalized);
      if (index === -1) throw httpError('Domain not found', 404);

      const existing = config.entries[index];
      if (existing.source !== 'ollama') {
        throw httpError('Only an AI verdict can be overridden here — edit domains.json by hand', 403);
      }
      if (existing.category === 'adult') {
        throw httpError('An adult block is never lifted from the browser', 403);
      }

      config.entries[index] = { ...existing, category, source: 'manual' };
    });

    log.info({ domain: normalized, category }, 'AI verdict overridden by human');
    return { entry: { domain: normalized, category, source: 'manual' }, expandedDomains };
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
