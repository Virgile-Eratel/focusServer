#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * CLI d'amorçage : génère hosts.blocked + pf.user.conf.template depuis domains.json.
 *
 * Utilisé uniquement par install.sh, pour que les fichiers système existent avant
 * le premier démarrage du serveur. En fonctionnement normal, le serveur régénère
 * ces fichiers lui-même à chaque tick (cf. `syncSystemFilesIfChanged()` dans domain.service).
 *
 * Usage:
 *   node dist/scripts/generate-system-config.js --input <domains.json> --out-dir <dir>
 */

import { readFileSync } from 'fs';
import type { DomainsConfig } from '../types/domains';
import { generateSystemFiles } from '../services/systemConfig.service';

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function main(): void {
  const input = getArg('input');
  const outDir = getArg('out-dir');

  if (!input || !outDir) {
    console.error('Usage: generate-system-config --input <domains.json> --out-dir <dir>');
    process.exit(2);
  }

  const config = JSON.parse(readFileSync(input, 'utf-8')) as DomainsConfig;
  generateSystemFiles(config, outDir);

  console.log(`Generated hosts.blocked + pf.user.conf.template in ${outDir}`);
}

main();
