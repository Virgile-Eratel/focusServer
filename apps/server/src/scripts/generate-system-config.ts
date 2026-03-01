#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate system config files from config/domains.json:
 * - hosts.blocked
 * - pf.user.conf.template
 *
 * Usage:
 *   node dist/scripts/generate-system-config.js \
 *     --input /path/to/domains.json \
 *     --out-dir /usr/local/etc/focus
 *
 * Output:
 *   <out-dir>/hosts.blocked
 *   <out-dir>/pf.user.conf.template
 */

import fs from 'fs';
import path from 'path';
import { normalizeHostname } from '../utils/hostname';

// --- Types internes ---

interface DomainJsonEntry {
  domain: string;
  aliases?: string[];
  tags?: string[];
  includeWww?: boolean;
  includeMobile?: boolean;
  hosts?: boolean;
  pf?: boolean;
}

interface DomainsJson {
  version: number;
  defaults: {
    includeWww?: boolean;
    includeMobile?: boolean;
    hosts?: boolean;
    pf?: boolean;
  };
  entries: DomainJsonEntry[];
}

interface GroupData {
  hosts: string[];
  pf: string[];
}

// --- Utilitaires ---

function parseArgs(argv: string[]): Record<string, string | boolean | string[]> & { _: string[] } {
  const args: Record<string, string | boolean | string[]> & { _: string[] } = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function uniqueStable(list: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function buildHostnamesForEntry(entry: DomainJsonEntry, defaults: DomainsJson['defaults']): string[] {
  const domain = normalizeHostname(entry.domain);
  if (!domain) {
    throw new Error(`Invalid entry.domain: ${JSON.stringify(entry.domain)}`);
  }

  const includeWww = entry.includeWww ?? defaults.includeWww ?? false;
  const includeMobile = entry.includeMobile ?? defaults.includeMobile ?? false;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];

  const out: (string | null)[] = [domain];
  if (includeWww) out.push(`www.${domain}`);
  if (includeMobile) out.push(`m.${domain}`);
  for (const a of aliases) {
    const h = normalizeHostname(a);
    if (h) out.push(h);
  }

  return uniqueStable(out);
}

function groupEntries(domainsJson: DomainsJson): Map<string, GroupData> {
  const defaults = domainsJson.defaults ?? {};
  const entries = Array.isArray(domainsJson.entries) ? domainsJson.entries : [];

  const groups = new Map<string, GroupData>();
  const ensureGroup = (tag: string): GroupData => {
    if (!groups.has(tag)) groups.set(tag, { hosts: [], pf: [] });
    return groups.get(tag)!;
  };

  for (const entry of entries) {
    const tag = (Array.isArray(entry.tags) && entry.tags[0]) || 'ungrouped';
    const g = ensureGroup(tag);
    const hostnames = buildHostnamesForEntry(entry, defaults);

    const hostsEnabled = entry.hosts ?? defaults.hosts ?? true;
    const pfEnabled = entry.pf ?? defaults.pf ?? true;

    if (hostsEnabled) g.hosts.push(...hostnames);
    if (pfEnabled) g.pf.push(...hostnames);
  }

  // Remove duplicates
  for (const [tag, g] of groups.entries()) {
    groups.set(tag, {
      hosts: uniqueStable(g.hosts),
      pf: uniqueStable(g.pf),
    });
  }

  return groups;
}

function renderHostsBlocked(groups: Map<string, GroupData>): string {
  const lines: string[] = [];
  lines.push('##');
  lines.push('# Host Database');
  lines.push('#');
  lines.push('# localhost is used to configure the loopback interface');
  lines.push('# when the system is booting.  Do not change this entry.');
  lines.push('##');
  lines.push('127.0.0.1\tlocalhost');
  lines.push('255.255.255.255\tbroadcasthost');
  lines.push('::1             localhost');
  lines.push('');
  lines.push('# ==========================================');
  lines.push('# FOCUS SERVER - BLOCKED SITES (generated)');
  lines.push('# ==========================================');
  lines.push('');

  for (const [tag, g] of groups.entries()) {
    if (!g.hosts.length) continue;
    lines.push(`# --- ${String(tag).toUpperCase()} ---`);
    for (const h of g.hosts) {
      lines.push(`0.0.0.0 ${h}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function renderPfTemplate(groups: Map<string, GroupData>): string {
  const lines: string[] = [];
  lines.push('# ==========================================');
  lines.push('# Auto-generated PF block rules (template)');
  lines.push('# FocusServer - User Block Anchor');
  lines.push('# ==========================================');
  lines.push('');
  lines.push('# Default policy: return an error (RST), do not wait for timeout');
  lines.push('set block-policy return');
  lines.push('');

  for (const [tag, g] of groups.entries()) {
    if (!g.pf.length) continue;
    lines.push(`# --- ${String(tag).toUpperCase()} ---`);
    for (const h of g.pf) {
      lines.push(`block return out quick to ${h}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function main(): void {
  const args = parseArgs(process.argv);
  const input = (args.input as string) || path.join(process.cwd(), 'config', 'domains.json');
  const outDir = (args['out-dir'] as string) || (args.outDir as string) || null;

  if (!outDir) {
    console.error('Missing --out-dir');
    process.exit(2);
  }

  const raw = fs.readFileSync(input, 'utf8');
  const domainsJson: DomainsJson = JSON.parse(raw);
  if (domainsJson.version !== 1) {
    throw new Error(`Unsupported domains.json version: ${domainsJson.version}`);
  }

  const groups = groupEntries(domainsJson);
  const hostsBlocked = renderHostsBlocked(groups);
  const pfTemplate = renderPfTemplate(groups);

  fs.mkdirSync(outDir, { recursive: true });

  const hostsPath = path.join(outDir, 'hosts.blocked');
  const pfPath = path.join(outDir, 'pf.user.conf.template');

  fs.writeFileSync(hostsPath, hostsBlocked, 'utf8');
  fs.writeFileSync(pfPath, pfTemplate, 'utf8');

  if (args.print) {
    console.log('--- hosts.blocked ---');
    console.log(hostsBlocked);
    console.log('--- pf.user.conf.template ---');
    console.log(pfTemplate);
  }
}

main();
