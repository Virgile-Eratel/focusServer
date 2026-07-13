import { describe, it, expect } from 'vitest';
import {
  assertSupportedVersion,
  expandDomainEntries,
  renderHostsBlocked,
  renderPfTemplate,
} from '../../../src/services/systemConfig.service';
import type { DomainsConfig } from '../../../src/types/domains';

const defaults = { includeWww: true, includeMobile: false };

function makeConfig(
  entries: DomainsConfig['entries'],
  overrideDefaults?: Partial<DomainsConfig['defaults']>,
): DomainsConfig {
  return { version: 1, defaults: { ...defaults, ...overrideDefaults }, entries };
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

describe('assertSupportedVersion', () => {
  it('accepts version 1', () => {
    expect(() => assertSupportedVersion(makeConfig([]))).not.toThrow();
  });

  it('rejects an unsupported version', () => {
    expect(() => assertSupportedVersion({ ...makeConfig([]), version: 2 })).toThrow(/Unsupported domains.json version/);
  });

  it('rejects entries that are not an array', () => {
    const broken = { version: 1, defaults, entries: undefined } as unknown as DomainsConfig;
    expect(() => assertSupportedVersion(broken)).toThrow(/must be an array/);
  });
});

describe('renderHostsBlocked', () => {
  const config = makeConfig([
    { domain: 'facebook.com', tags: ['social'] },
    { domain: 'youtube.com', tags: ['video'] },
  ]);

  it('keeps the localhost entries — /etc/hosts is overwritten with this file', () => {
    const output = renderHostsBlocked(config);
    expect(output).toContain('127.0.0.1\tlocalhost');
    expect(output).toContain('::1             localhost');
  });

  it('maps every expanded hostname to 0.0.0.0, grouped by tag', () => {
    const output = renderHostsBlocked(config);
    expect(output).toContain('# --- SOCIAL ---');
    expect(output).toContain('0.0.0.0 facebook.com');
    expect(output).toContain('0.0.0.0 www.facebook.com');
    expect(output).toContain('# --- VIDEO ---');
    expect(output).toContain('0.0.0.0 youtube.com');
  });

  it('omits entries opting out of hosts', () => {
    const output = renderHostsBlocked(makeConfig([{ domain: 'facebook.com', hosts: false }]));
    expect(output).not.toContain('facebook.com');
  });
});

describe('renderPfTemplate', () => {
  it('emits a block rule per hostname', () => {
    const output = renderPfTemplate(makeConfig([{ domain: 'facebook.com', tags: ['social'] }]));
    expect(output).toContain('set block-policy return');
    expect(output).toContain('block return out quick to facebook.com');
    expect(output).toContain('block return out quick to www.facebook.com');
  });

  it('omits entries opting out of pf', () => {
    const output = renderPfTemplate(makeConfig([{ domain: 'facebook.com', pf: false }]));
    expect(output).not.toContain('facebook.com');
  });
});
