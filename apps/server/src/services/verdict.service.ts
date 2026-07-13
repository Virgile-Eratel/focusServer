import path from 'path';
import { mkdirSync } from 'fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { DomainSource, VerdictCategory } from '@focus/shared';
import { DEFAULT_SYSTEM_DIR } from '../utils/constants';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('verdict');

/**
 * La table des verdicts de classification (spec §5.2).
 *
 * SQLite n'est PAS un cache : le fichier sur disque EST la donnée. Un verdict
 * (« github.com a été jugé other le 13/07 ») n'est pas recalculable — le
 * re-demander au modèle pourrait donner une autre réponse (spec §3.8).
 *
 * Seul propriétaire de `node:sqlite` (API expérimentale) : si elle casse un
 * jour, le repli better-sqlite3 est une substitution locale à ce module.
 */

export type VerdictRow = {
  domain: string; // eTLD+1
  category: VerdictCategory;
  source: DomainSource;
  decidedAt: string; // ISO 8601
  evidence: string | null;
};

const DB_PATH =
  process.env.VERDICTS_DB_PATH || path.join(process.env.FOCUS_SYSTEM_DIR || DEFAULT_SYSTEM_DIR, 'verdicts.db');

type Statements = {
  get: StatementSync;
  upsert: StatementSync;
  remove: StatementSync;
  recent: StatementSync;
  unknown: StatementSync;
};

let database: DatabaseSync | null = null;
let statements: Statements | null = null;

/** Ouverture paresseuse + statements préparés une seule fois (chemin chaud). */
function stmts(): Statements {
  if (!statements) {
    if (DB_PATH !== ':memory:') {
      // Sur une machine de dev sans install.sh, le répertoire n'existe pas
      // encore : sans lui, la première classification serait un 500 permanent.
      mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    database = new DatabaseSync(DB_PATH);
    database.exec('PRAGMA journal_mode = WAL');
    database.exec(`
      CREATE TABLE IF NOT EXISTS verdicts (
        domain      TEXT PRIMARY KEY,
        category    TEXT NOT NULL,
        source      TEXT NOT NULL,
        decided_at  TEXT NOT NULL,
        evidence    TEXT
      )
    `);
    statements = {
      get: database.prepare('SELECT * FROM verdicts WHERE domain = ?'),
      upsert: database.prepare(
        `INSERT INTO verdicts (domain, category, source, decided_at, evidence)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(domain) DO UPDATE SET
           category = excluded.category,
           source = excluded.source,
           decided_at = excluded.decided_at,
           evidence = excluded.evidence`,
      ),
      remove: database.prepare('DELETE FROM verdicts WHERE domain = ?'),
      recent: database.prepare('SELECT * FROM verdicts ORDER BY decided_at DESC LIMIT ?'),
      unknown: database.prepare("SELECT * FROM verdicts WHERE category = 'unknown' ORDER BY decided_at ASC"),
    };
    log.info({ path: DB_PATH }, 'Verdicts database opened');
  }
  return statements;
}

type RawRow = {
  domain: string;
  category: string;
  source: string;
  decided_at: string;
  evidence: string | null;
};

function toVerdictRow(raw: RawRow): VerdictRow {
  return {
    domain: raw.domain,
    category: raw.category as VerdictCategory,
    source: raw.source as DomainSource,
    decidedAt: raw.decided_at,
    evidence: raw.evidence,
  };
}

export function getVerdict(domain: string): VerdictRow | null {
  const raw = stmts().get.get(domain) as RawRow | undefined;
  return raw ? toVerdictRow(raw) : null;
}

export function saveVerdict(row: VerdictRow): void {
  stmts().upsert.run(row.domain, row.category, row.source, row.decidedAt, row.evidence);
}

/** `true` si une ligne a été effacée. */
export function deleteVerdict(domain: string): boolean {
  return stmts().remove.run(domain).changes > 0;
}

export function listRecentVerdicts(limit = 50): VerdictRow[] {
  return (stmts().recent.all(limit) as RawRow[]).map(toVerdictRow);
}

/** Les verdicts `unknown` — souvent le signe qu'Ollama était éteint, re-tentables. */
export function listUnknownVerdicts(): VerdictRow[] {
  return (stmts().unknown.all() as RawRow[]).map(toVerdictRow);
}

/** Pour les tests : referme la base pour qu'un resetModules reparte à neuf. */
export function closeDb(): void {
  database?.close();
  database = null;
  statements = null;
}
