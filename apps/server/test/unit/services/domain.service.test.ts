import { describe, it, expect } from 'vitest';
import { expandDomainEntries, type DomainsConfig } from '../../../src/services/domain.service';

const defaults = { includeWww: true, includeMobile: false };

function makeConfig(entries: DomainsConfig['entries'], overrideDefaults?: Partial<DomainsConfig['defaults']>): DomainsConfig {
  return { version: 1, defaults: { ...defaults, ...overrideDefaults }, entries };
}

describe('expandDomainEntries', () => {
  it('expands a single domain with www (default)', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'example.com' }]));
    expect(result).toEqual(['example.com', 'www.example.com']);
  });

  it('skips www when entry overrides includeWww: false', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'x.com', includeWww: false }]),
    );
    expect(result).toEqual(['x.com']);
  });

  it('includes mobile variant when entry opts in', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'youtube.com', includeMobile: true }]),
    );
    expect(result).toContain('m.youtube.com');
  });

  it('includes mobile for all entries when default is true', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'reddit.com' }], { includeMobile: true }),
    );
    expect(result).toEqual(['reddit.com', 'www.reddit.com', 'm.reddit.com']);
  });

  it('expands aliases with www', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'youtube.com', aliases: ['youtu.be'] }]),
    );
    expect(result).toContain('youtu.be');
    expect(result).toContain('www.youtu.be');
  });

  it('skips www on aliases when includeWww is false', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'yt.com', includeWww: false, aliases: ['youtu.be'] }]),
    );
    expect(result).toContain('youtu.be');
    expect(result).not.toContain('www.youtu.be');
  });

  it('deduplicates when alias matches domain', () => {
    const result = expandDomainEntries(
      makeConfig([{ domain: 'example.com', aliases: ['example.com'] }]),
    );
    const count = result.filter((d) => d === 'example.com').length;
    expect(count).toBe(1);
  });

  it('returns empty array for empty entries', () => {
    const result = expandDomainEntries(makeConfig([]));
    expect(result).toEqual([]);
  });

  it('handles multiple entries correctly', () => {
    const result = expandDomainEntries(
      makeConfig([
        { domain: 'facebook.com' },
        { domain: 'twitter.com' },
      ]),
    );
    expect(result).toEqual([
      'facebook.com', 'www.facebook.com',
      'twitter.com', 'www.twitter.com',
    ]);
  });
});
