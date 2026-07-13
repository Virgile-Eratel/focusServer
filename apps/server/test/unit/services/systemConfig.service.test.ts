import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  assertSupportedVersion,
  expandDomainEntries,
  expandDomainEntriesFor,
  generateSystemFiles,
  renderHostsFile,
  renderPfFile,
} from '../../../src/services/systemConfig.service';
import { BLOCKED_FILE_CATEGORIES } from '../../../src/config/categories';
import type { DomainEntry, DomainsConfig } from '../../../src/types/domains';

const defaults = { includeWww: true, includeMobile: false };

type PartialEntry = Partial<DomainEntry> & { domain: string };

function makeConfig(entries: PartialEntry[], overrideDefaults?: Partial<DomainsConfig['defaults']>): DomainsConfig {
  return {
    version: 2,
    defaults: { ...defaults, ...overrideDefaults },
    entries: entries.map((entry) => ({
      category: 'entertainment' as const,
      source: 'manual' as const,
      ...entry,
    })),
  };
}

describe('expandDomainEntries', () => {
  it('expands a single domain with www (default)', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'example.com' }]));
    expect(result).toEqual(['example.com', 'www.example.com']);
  });

  it('skips www when entry overrides includeWww: false', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'x.com', includeWww: false }]));
    expect(result).toEqual(['x.com']);
  });

  it('includes mobile variant when entry opts in', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'youtube.com', includeMobile: true }]));
    expect(result).toContain('m.youtube.com');
  });

  it('includes mobile for all entries when default is true', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'reddit.com' }], { includeMobile: true }));
    expect(result).toEqual(['reddit.com', 'www.reddit.com', 'm.reddit.com']);
  });

  it('expands aliases with www', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'youtube.com', aliases: ['youtu.be'] }]));
    expect(result).toContain('youtu.be');
    expect(result).toContain('www.youtu.be');
  });

  it('skips www on aliases when includeWww is false', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'yt.com', includeWww: false, aliases: ['youtu.be'] }]));
    expect(result).toContain('youtu.be');
    expect(result).not.toContain('www.youtu.be');
  });

  it('deduplicates when alias matches domain', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'example.com', aliases: ['example.com'] }]));
    expect(result.filter((d) => d === 'example.com')).toHaveLength(1);
  });

  it('returns empty array for empty entries', () => {
    expect(expandDomainEntries(makeConfig([]))).toEqual([]);
  });

  it('handles multiple entries correctly', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'facebook.com' }, { domain: 'twitter.com' }]));
    expect(result).toEqual(['facebook.com', 'www.facebook.com', 'twitter.com', 'www.twitter.com']);
  });

  it('throws on an invalid domain', () => {
    expect(() => expandDomainEntries(makeConfig([{ domain: 'not valid!' }]))).toThrow(/Invalid entry.domain/);
  });
});

describe('expandDomainEntriesFor', () => {
  const config = makeConfig([
    { domain: 'porn.com', category: 'adult' },
    { domain: 'youtube.com', category: 'entertainment' },
    { domain: 'github.com', category: 'other' },
  ]);

  it('restreint aux catégories demandées', () => {
    const result = expandDomainEntriesFor(config, ['adult']);
    expect(result).toEqual(['porn.com', 'www.porn.com']);
  });

  it('combine plusieurs catégories', () => {
    const result = expandDomainEntriesFor(config, ['adult', 'entertainment']);
    expect(result).toContain('porn.com');
    expect(result).toContain('youtube.com');
    expect(result).not.toContain('github.com');
  });
});

describe('assertSupportedVersion', () => {
  it('accepts version 2', () => {
    expect(() => assertSupportedVersion(makeConfig([]))).not.toThrow();
  });

  it('rejects version 1 — la migration doit passer avant', () => {
    expect(() => assertSupportedVersion({ ...makeConfig([]), version: 1 })).toThrow(/Unsupported domains.json version/);
  });

  it('rejects entries that are not an array', () => {
    const broken = { version: 2, defaults, entries: undefined } as unknown as DomainsConfig;
    expect(() => assertSupportedVersion(broken)).toThrow(/must be an array/);
  });
});

describe('renderHostsFile — mode blocked (adult + entertainment)', () => {
  const config = makeConfig([
    { domain: 'porn.com', category: 'adult' },
    { domain: 'youtube.com', category: 'entertainment' },
    { domain: 'github.com', category: 'other' },
  ]);

  it('keeps the localhost entries — /etc/hosts is overwritten with this file', () => {
    const output = renderHostsFile(config, BLOCKED_FILE_CATEGORIES);
    expect(output).toContain('127.0.0.1\tlocalhost');
    expect(output).toContain('::1             localhost');
  });

  it('bloque adult + entertainment, groupés par catégorie — jamais other', () => {
    const output = renderHostsFile(config, BLOCKED_FILE_CATEGORIES);
    expect(output).toContain('# --- ADULT ---');
    expect(output).toContain('0.0.0.0 porn.com');
    expect(output).toContain('# --- ENTERTAINMENT ---');
    expect(output).toContain('0.0.0.0 youtube.com');
    expect(output).not.toContain('github.com');
  });

  it('omits entries opting out of hosts', () => {
    const output = renderHostsFile(makeConfig([{ domain: 'facebook.com', hosts: false }]), BLOCKED_FILE_CATEGORIES);
    expect(output).not.toContain('facebook.com');
  });
});

describe('renderHostsFile — mode unblocked (adult seulement)', () => {
  it('ne contient que les domaines adult', () => {
    const config = makeConfig([
      { domain: 'porn.com', category: 'adult' },
      { domain: 'youtube.com', category: 'entertainment' },
    ]);
    const output = renderHostsFile(config, ['adult']);
    expect(output).toContain('0.0.0.0 porn.com');
    expect(output).not.toContain('youtube.com');
  });

  it('reste un fichier hosts valide sans aucune entrée adult', () => {
    const output = renderHostsFile(makeConfig([{ domain: 'youtube.com' }]), ['adult']);
    expect(output).toContain('127.0.0.1\tlocalhost');
    expect(output).not.toContain('0.0.0.0');
  });
});

describe('renderPfFile', () => {
  it('emits a block rule per hostname', () => {
    const output = renderPfFile(makeConfig([{ domain: 'facebook.com' }]), BLOCKED_FILE_CATEGORIES);
    expect(output).toContain('set block-policy return');
    expect(output).toContain('block return out quick to facebook.com');
    expect(output).toContain('block return out quick to www.facebook.com');
  });

  it('omits entries opting out of pf', () => {
    const output = renderPfFile(makeConfig([{ domain: 'facebook.com', pf: false }]), BLOCKED_FILE_CATEGORIES);
    expect(output).not.toContain('facebook.com');
  });

  it('en mode unblocked, seuls les adult restent bloqués par PF', () => {
    const config = makeConfig([
      { domain: 'porn.com', category: 'adult' },
      { domain: 'youtube.com', category: 'entertainment' },
    ]);
    const output = renderPfFile(config, ['adult']);
    expect(output).toContain('block return out quick to porn.com');
    expect(output).not.toContain('youtube.com');
  });
});

describe('generateSystemFiles', () => {
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(path.join(tmpdir(), 'focus-test-'));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('écrit les 4 fichiers, chacun avec les bonnes catégories', () => {
    const config = makeConfig([
      { domain: 'porn.com', category: 'adult' },
      { domain: 'youtube.com', category: 'entertainment' },
      { domain: 'github.com', category: 'other' },
    ]);

    generateSystemFiles(config, outDir);

    const hostsBlocked = readFileSync(path.join(outDir, 'hosts.blocked'), 'utf-8');
    const hostsUnblocked = readFileSync(path.join(outDir, 'hosts.unblocked'), 'utf-8');
    const pfBlocked = readFileSync(path.join(outDir, 'pf.user.conf.template'), 'utf-8');
    const pfUnblocked = readFileSync(path.join(outDir, 'pf.unblocked.conf.template'), 'utf-8');

    expect(hostsBlocked).toContain('porn.com');
    expect(hostsBlocked).toContain('youtube.com');
    expect(hostsUnblocked).toContain('porn.com');
    expect(hostsUnblocked).not.toContain('youtube.com');
    expect(pfBlocked).toContain('porn.com');
    expect(pfBlocked).toContain('youtube.com');
    expect(pfUnblocked).toContain('porn.com');
    expect(pfUnblocked).not.toContain('youtube.com');

    for (const content of [hostsBlocked, hostsUnblocked, pfBlocked, pfUnblocked]) {
      expect(content).not.toContain('github.com');
    }
  });

  it('rejette une config non migrée (version 1)', () => {
    const v1 = { ...makeConfig([]), version: 1 };
    expect(() => generateSystemFiles(v1, outDir)).toThrow(/Unsupported/);
  });
});
