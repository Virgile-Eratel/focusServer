import { readFileSync } from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('domain');

export type DomainEntry = {
  domain: string;
  aliases?: string[];
  includeWww?: boolean;
  includeMobile?: boolean;
};

export type DomainsConfig = {
  version: number;
  defaults: {
    includeWww: boolean;
    includeMobile: boolean;
  };
  entries: DomainEntry[];
};

let cachedDomains: string[] | null = null;

function loadDomainsConfig(): DomainsConfig {
  const configPath = path.resolve(__dirname, '../../config/domains.json');
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as DomainsConfig;
  } catch (error) {
    const e = error as Error;
    const message =
      error instanceof SyntaxError
        ? `Invalid JSON in ${configPath}: ${error.message}`
        : `Failed to read ${configPath}: ${e.message}`;
    log.error({ err: e, configPath }, 'Failed to load domains config');
    throw new Error(message);
  }
}

/**
 * Pure function: expands a DomainsConfig into a flat deduplicated list of hostnames.
 * Mirrors the expansion logic from scripts/generate-system-config.js
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
  cachedDomains = expandDomainEntries(loadDomainsConfig());
  return cachedDomains;
}
