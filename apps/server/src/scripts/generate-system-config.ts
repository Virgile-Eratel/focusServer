#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * CLI d'amorçage : génère les 4 fichiers système (hosts.blocked,
 * hosts.unblocked, pf.user.conf.template, pf.unblocked.conf.template) depuis
 * domains.json.
 *
 * Utilisé uniquement par install.sh, pour que les fichiers système existent avant
 * le premier démarrage du serveur. En fonctionnement normal, le serveur régénère
 * ces fichiers lui-même à chaque tick (cf. `syncSystemFilesIfChanged()` dans domain.service).
 *
 * Un domains.json v1 est migré en mémoire seulement : install.sh tourne en
 * root, il ne doit pas réécrire le fichier du projet — le serveur s'en charge
 * à son premier démarrage.
 *
 * Usage:
 *   node dist/scripts/generate-system-config.js --input <domains.json> --out-dir <dir>
 */

import { readFileSync } from 'fs';
import { migrateConfig } from '../services/domainsMigration';
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

  const { config, warnings } = migrateConfig(JSON.parse(readFileSync(input, 'utf-8')));
  for (const warning of warnings) console.warn(`⚠️  ${warning}`);
  generateSystemFiles(config, outDir);

  console.log(
    `Generated hosts.blocked, hosts.unblocked, pf.user.conf.template, pf.unblocked.conf.template in ${outDir}`,
  );
}

main();
