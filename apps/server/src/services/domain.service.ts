import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { DomainEntryResponse } from '@focus/shared';
import { normalizeHostname } from '../utils/hostname';
import { applyMode, calculateTargetMode } from './focus.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('domain');

const execFileAsync = promisify(execFile);

// --- Types ---

export type DomainEntry = {
  domain: string;
  aliases?: string[];
  includeWww?: boolean;
  includeMobile?: boolean;
  tags?: string[];
};

export type DomainsConfig = {
  version: number;
  defaults: {
    includeWww: boolean;
    includeMobile: boolean;
  };
  entries: DomainEntry[];
};

// --- Paths ---

/** Chemin runtime des domaines (installé par install.sh). */
const DOMAINS_PATH = process.env.DOMAINS_PATH || '/usr/local/etc/focus/domains.json';

/** Script compilé de régénération (depuis dist/). */
const GEN_SCRIPT_PATH = path.resolve(__dirname, '../scripts/generate-system-config.js');

/** Répertoire de sortie pour les fichiers système générés. */
const SYSTEM_DIR = path.dirname(DOMAINS_PATH);

// --- Dual cache ---

/**
 * Deux niveaux de cache :
 * - cachedConfig: DomainsConfig | null — config brute (pour getDomainEntries)
 * - cachedDomains: string[] | null — domaines expansés (pour getExpandedDomains)
 *
 * Lazy-init : chaque cache est peuplé à la première lecture, puis invalidé
 * après chaque écriture (addDomain / removeDomain).
 */
let cachedConfig: DomainsConfig | null = null;
let cachedDomains: string[] | null = null;

function loadConfig(): DomainsConfig {
  if (!cachedConfig) {
    const raw = readFileSync(DOMAINS_PATH, 'utf-8');
    cachedConfig = JSON.parse(raw) as DomainsConfig;
  }
  return cachedConfig;
}

/** Invalide les deux caches — force une relecture au prochain appel. */
export function invalidateDomainCache(): void {
  cachedConfig = null;
  cachedDomains = null;
}

// --- Write lock ---

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

// --- Regeneration ---

async function regenerateSystemConfig(): Promise<void> {
  await execFileAsync('node', [GEN_SCRIPT_PATH, '--input', DOMAINS_PATH, '--out-dir', SYSTEM_DIR]);
}

// --- Public API ---

/**
 * Pure function: expands a DomainsConfig into a flat deduplicated list of hostnames.
 * Mirrors the expansion logic from generate-system-config.
 */
export function expandDomainEntries(config: DomainsConfig): string[] {
  const domains = new Set<string>();

  for (const entry of config.entries) {
    domains.add(entry.domain);

    const includeWww = entry.includeWww ?? config.defaults.includeWww;
    if (includeWww) domains.add(`www.${entry.domain}`);

    const includeMobile = entry.includeMobile ?? config.defaults.includeMobile;
    if (includeMobile) domains.add(`m.${entry.domain}`);

    if (entry.aliases) {
      for (const alias of entry.aliases) {
        domains.add(alias);
        if (includeWww) domains.add(`www.${alias}`);
      }
    }
  }

  return Array.from(domains);
}

/** Cached wrapper — reads domains.json once, then returns from cache. */
export function getExpandedDomains(): string[] {
  if (cachedDomains) return cachedDomains;
  cachedDomains = expandDomainEntries(loadConfig());
  return cachedDomains;
}

/** Retourne les entrées brutes (non expansées) depuis le cache. */
export function getDomainEntries(): DomainEntryResponse[] {
  const config = loadConfig();
  return config.entries.map((e) => ({
    domain: e.domain,
    tags: e.tags ?? [],
  }));
}

/**
 * Ajoute un domaine.
 * 1. Valide via normalizeHostname()
 * 2. Vérifie qu'il n'existe pas déjà (409)
 * 3. Écrit le JSON modifié dans DOMAINS_PATH
 * 4. Régénère hosts.blocked + pf.user.conf.template via le script TS compilé
 * 5. Invalide le cache mémoire
 * 6. Si mode courant = blocked → applyMode(target, { force: true })
 */
export async function addDomain(
  domain: string,
  tags?: string[],
): Promise<{ entry: DomainEntryResponse; expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) {
    const err = new Error('Invalid domain format') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  return withWriteLock(async () => {
    // Read fresh from disk inside the lock
    const raw = readFileSync(DOMAINS_PATH, 'utf-8');
    const config = JSON.parse(raw) as DomainsConfig;

    const existing = config.entries.find((e) => e.domain === normalized);
    if (existing) {
      const err = new Error('Domain already exists') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }

    const newEntry: DomainEntry = { domain: normalized };
    if (tags && tags.length > 0) newEntry.tags = tags;
    config.entries.push(newEntry);

    const previousRaw = raw;

    // Write
    writeFileSync(DOMAINS_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    // Regenerate system config
    try {
      await regenerateSystemConfig();
    } catch (error) {
      // Rollback
      writeFileSync(DOMAINS_PATH, previousRaw, 'utf-8');
      log.error({ err: error as Error }, 'generate-system-config failed, rolling back');
      throw new Error('Failed to regenerate system config');
    }

    // Invalidate cache
    invalidateDomainCache();

    // Force-apply if currently blocked
    const target = calculateTargetMode();
    if (target === 'blocked') {
      await applyMode(target, { force: true, reason: 'domain list changed' });
    }

    const expandedDomains = getExpandedDomains();
    const entry: DomainEntryResponse = { domain: normalized, tags: newEntry.tags ?? [] };

    log.info({ domain: normalized }, 'Domain added');
    return { entry, expandedDomains };
  });
}

/**
 * Supprime un domaine.
 * Même pipeline que addDomain (write → regenerate → invalidate → applyMode force).
 */
export async function removeDomain(domain: string): Promise<{ expandedDomains: string[] }> {
  const normalized = normalizeHostname(domain);
  if (!normalized) {
    const err = new Error('Invalid domain format') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  return withWriteLock(async () => {
    const raw = readFileSync(DOMAINS_PATH, 'utf-8');
    const config = JSON.parse(raw) as DomainsConfig;

    const idx = config.entries.findIndex((e) => e.domain === normalized);
    if (idx === -1) {
      const err = new Error('Domain not found') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    config.entries.splice(idx, 1);

    const previousRaw = raw;

    writeFileSync(DOMAINS_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    try {
      await regenerateSystemConfig();
    } catch (error) {
      writeFileSync(DOMAINS_PATH, previousRaw, 'utf-8');
      log.error({ err: error as Error }, 'generate-system-config failed, rolling back');
      throw new Error('Failed to regenerate system config');
    }

    invalidateDomainCache();

    const target = calculateTargetMode();
    if (target === 'blocked') {
      await applyMode(target, { force: true, reason: 'domain list changed' });
    }

    const expandedDomains = getExpandedDomains();

    log.info({ domain: normalized }, 'Domain removed');
    return { expandedDomains };
  });
}
