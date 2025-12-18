#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate system config files from config/domains.json:
 * - hosts.blocked
 * - pf.user.conf.template
 *
 * Usage:
 *   node scripts/generate-system-config.js \
 *     --input /path/to/domains.json \
 *     --out-dir /usr/local/etc
 *
 * Output:
 *   <out-dir>/hosts.blocked
 *   <out-dir>/pf.user.conf.template
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { _: [] };
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

function normalizeHostname(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;

  // Extract hostname from URL
  let host = raw;
  try {
    if (raw.includes('://')) host = new URL(raw).hostname;
  } catch {
    // ignore
  }

  // Remove path/query fragments
  host = host.split('/')[0].split('?')[0].split('#')[0];

  // Remove trailing dot
  if (host.endsWith('.')) host = host.slice(0, -1);

  // Small sanity check
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes('.')) return null;
  if (host.startsWith('.') || host.endsWith('.')) return null;
  if (host.includes('..')) return null;

  return host;
}

function uniqueStable(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function buildHostnamesForEntry(entry, defaults) {
  const domain = normalizeHostname(entry.domain);
  if (!domain) {
    throw new Error(`Invalid entry.domain: ${JSON.stringify(entry.domain)}`);
  }

  const includeWww = entry.includeWww ?? defaults.includeWww ?? false;
  const includeMobile = entry.includeMobile ?? defaults.includeMobile ?? false;
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];

  const out = [domain];
  if (includeWww) out.push(`www.${domain}`);
  if (includeMobile) out.push(`m.${domain}`);
  for (const a of aliases) {
    const h = normalizeHostname(a);
    if (h) out.push(h);
  }

  return uniqueStable(out);
}

function groupEntries(domainsJson) {
  const defaults = domainsJson.defaults ?? {};
  const entries = Array.isArray(domainsJson.entries) ? domainsJson.entries : [];

  const groups = new Map(); // tag -> { hosts: string[], pf: string[] }
  const ensureGroup = (tag) => {
    if (!groups.has(tag)) groups.set(tag, { hosts: [], pf: [] });
    return groups.get(tag);
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

function renderHostsBlocked(groups) {
  const lines = [];
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

function renderPfTemplate(groups) {
  const lines = [];
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

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || path.join(process.cwd(), 'config', 'domains.json');
  const outDir = args['out-dir'] || args.outDir || null;

  if (!outDir) {
    console.error('Missing --out-dir');
    process.exit(2);
  }

  const raw = fs.readFileSync(input, 'utf8');
  const domainsJson = JSON.parse(raw);
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


