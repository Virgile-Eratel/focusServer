import { mkdirSync } from 'fs';
import path from 'path';
import { DOMAINS_CONFIG_VERSION, type DomainDefaults, type DomainEntry, type DomainsConfig } from '../types/domains';
import { normalizeHostname } from '../utils/hostname';
import { writeFileAtomic } from '../utils/atomicWrite';

/**
 * Génération des fichiers système à partir de domains.json :
 * - hosts.blocked            → recopié vers /etc/hosts par focus-apply.sh
 * - pf.user.conf.template    → recopié vers /etc/pf.user.conf par focus-apply.sh
 *
 * Ce module ne touche qu'à `<outDir>` (/usr/local/etc/focusServer), jamais à /etc :
 * l'écriture privilégiée est le seul rôle de focus-apply.sh.
 */

type GroupData = { hosts: string[]; pf: string[] };

function uniqueStable(list: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** Valide la config et lève si la version n'est pas supportée. */
export function assertSupportedVersion(config: DomainsConfig): void {
  if (config.version !== DOMAINS_CONFIG_VERSION) {
    throw new Error(`Unsupported domains.json version: ${config.version}`);
  }
  if (!Array.isArray(config.entries)) {
    throw new Error('Invalid domains.json: "entries" must be an array');
  }
}

/**
 * Développe une entrée en la liste des hostnames à bloquer.
 * Les alias suivent le même traitement `www.` que le domaine principal.
 */
export function expandEntry(entry: DomainEntry, defaults: DomainDefaults): string[] {
  const domain = normalizeHostname(entry.domain);
  if (!domain) {
    throw new Error(`Invalid entry.domain: ${JSON.stringify(entry.domain)}`);
  }

  const includeWww = entry.includeWww ?? defaults.includeWww ?? false;
  const includeMobile = entry.includeMobile ?? defaults.includeMobile ?? false;

  const out: (string | null)[] = [domain];
  if (includeWww) out.push(`www.${domain}`);
  if (includeMobile) out.push(`m.${domain}`);

  for (const rawAlias of entry.aliases ?? []) {
    const alias = normalizeHostname(rawAlias);
    if (!alias) continue;
    out.push(alias);
    if (includeWww) out.push(`www.${alias}`);
  }

  return uniqueStable(out);
}

/** Liste plate et dédupliquée de tous les hostnames bloqués (utilisée par l'API). */
export function expandDomainEntries(config: DomainsConfig): string[] {
  const defaults = config.defaults ?? {};
  return uniqueStable(config.entries.flatMap((entry) => expandEntry(entry, defaults)));
}

/** Regroupe les hostnames par tag, en respectant les drapeaux `hosts` / `pf`. */
function groupEntries(config: DomainsConfig): Map<string, GroupData> {
  const defaults = config.defaults ?? {};
  const groups = new Map<string, GroupData>();

  for (const entry of config.entries) {
    const tag = entry.tags?.[0] || 'ungrouped';
    if (!groups.has(tag)) groups.set(tag, { hosts: [], pf: [] });
    const group = groups.get(tag)!;

    const hostnames = expandEntry(entry, defaults);
    if (entry.hosts ?? defaults.hosts ?? true) group.hosts.push(...hostnames);
    if (entry.pf ?? defaults.pf ?? true) group.pf.push(...hostnames);
  }

  for (const [tag, group] of groups) {
    groups.set(tag, { hosts: uniqueStable(group.hosts), pf: uniqueStable(group.pf) });
  }

  return groups;
}

export function renderHostsBlocked(config: DomainsConfig): string {
  const lines: string[] = [
    '##',
    '# Host Database',
    '#',
    '# localhost is used to configure the loopback interface',
    '# when the system is booting.  Do not change this entry.',
    '##',
    '127.0.0.1\tlocalhost',
    '255.255.255.255\tbroadcasthost',
    '::1             localhost',
    '',
    '# ==========================================',
    '# FOCUS SERVER - BLOCKED SITES (generated)',
    '# ==========================================',
    '',
  ];

  for (const [tag, group] of groupEntries(config)) {
    if (!group.hosts.length) continue;
    lines.push(`# --- ${tag.toUpperCase()} ---`);
    for (const hostname of group.hosts) {
      lines.push(`0.0.0.0 ${hostname}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function renderPfTemplate(config: DomainsConfig): string {
  const lines: string[] = [
    '# ==========================================',
    '# Auto-generated PF block rules (template)',
    '# FocusServer - User Block Anchor',
    '# ==========================================',
    '',
    '# Default policy: return an error (RST), do not wait for timeout',
    'set block-policy return',
    '',
  ];

  for (const [tag, group] of groupEntries(config)) {
    if (!group.pf.length) continue;
    lines.push(`# --- ${tag.toUpperCase()} ---`);
    for (const hostname of group.pf) {
      lines.push(`block return out quick to ${hostname}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Écrit hosts.blocked + pf.user.conf.template dans `outDir`.
 * Appelé en direct par le serveur (plus de sous-processus node) et par le CLI d'installation.
 */
export function generateSystemFiles(config: DomainsConfig, outDir: string): void {
  assertSupportedVersion(config);

  const hostsBlocked = renderHostsBlocked(config);
  const pfTemplate = renderPfTemplate(config);

  mkdirSync(outDir, { recursive: true });
  writeFileAtomic(path.join(outDir, 'hosts.blocked'), hostsBlocked);
  writeFileAtomic(path.join(outDir, 'pf.user.conf.template'), pfTemplate);
}
