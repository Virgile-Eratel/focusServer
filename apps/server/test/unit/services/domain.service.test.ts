import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandDomainEntries, type DomainsConfig } from '../../../src/services/domain.service';

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
    const count = result.filter((d) => d === 'example.com').length;
    expect(count).toBe(1);
  });

  it('returns empty array for empty entries', () => {
    const result = expandDomainEntries(makeConfig([]));
    expect(result).toEqual([]);
  });

  it('handles multiple entries correctly', () => {
    const result = expandDomainEntries(makeConfig([{ domain: 'facebook.com' }, { domain: 'twitter.com' }]));
    expect(result).toEqual(['facebook.com', 'www.facebook.com', 'twitter.com', 'www.twitter.com']);
  });
});

describe('addDomain / removeDomain / getDomainEntries', () => {
  let domainService: typeof import('../../../src/services/domain.service');
  let mockFs: { readFileSync: ReturnType<typeof vi.fn>; writeFileSync: ReturnType<typeof vi.fn> };
  let mockExecFileAsync: ReturnType<typeof vi.fn>;
  let mockApplyMode: ReturnType<typeof vi.fn>;
  let mockCalculateTargetMode: ReturnType<typeof vi.fn>;

  const sampleConfig: DomainsConfig = {
    version: 1,
    defaults: { includeWww: true, includeMobile: false },
    entries: [
      { domain: 'facebook.com', tags: ['social'] },
      { domain: 'youtube.com', tags: ['video'] },
    ],
  };

  beforeEach(async () => {
    vi.resetModules();

    mockFs = {
      readFileSync: vi.fn().mockReturnValue(JSON.stringify(sampleConfig)),
      writeFileSync: vi.fn(),
    };

    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    mockApplyMode = vi.fn().mockResolvedValue(undefined);
    mockCalculateTargetMode = vi.fn().mockReturnValue('blocked');

    vi.doMock('fs', () => ({
      readFileSync: mockFs.readFileSync,
      writeFileSync: mockFs.writeFileSync,
    }));

    vi.doMock('child_process', () => ({
      execFile: vi.fn(),
    }));

    vi.doMock('util', () => ({
      promisify: () => mockExecFileAsync,
    }));

    vi.doMock('../../../src/services/focus.service', () => ({
      applyMode: mockApplyMode,
      calculateTargetMode: mockCalculateTargetMode,
    }));

    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    }));

    domainService = await import('../../../src/services/domain.service');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDomainEntries', () => {
    it('returns entries from config with tags', () => {
      const entries = domainService.getDomainEntries();
      expect(entries).toEqual([
        { domain: 'facebook.com', tags: ['social'] },
        { domain: 'youtube.com', tags: ['video'] },
      ]);
    });

    it('returns empty tags array when entry has no tags', () => {
      const configNoTags = { ...sampleConfig, entries: [{ domain: 'x.com' }] };
      mockFs.readFileSync.mockReturnValue(JSON.stringify(configNoTags));
      domainService.invalidateDomainCache();
      const entries = domainService.getDomainEntries();
      expect(entries[0].tags).toEqual([]);
    });
  });

  describe('addDomain', () => {
    it('adds a valid domain and writes to file', async () => {
      const result = await domainService.addDomain('reddit.com', ['social']);
      expect(result.entry.domain).toBe('reddit.com');
      expect(result.entry.tags).toEqual(['social']);
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockExecFileAsync).toHaveBeenCalled();
    });

    it('throws 400 for invalid domain', async () => {
      await expect(domainService.addDomain('not valid!')).rejects.toThrow('Invalid domain format');
    });

    it('throws 409 for duplicate domain', async () => {
      try {
        await domainService.addDomain('facebook.com');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as any).statusCode).toBe(409);
      }
    });

    it('calls applyMode with force when mode is blocked', async () => {
      mockCalculateTargetMode.mockReturnValue('blocked');
      await domainService.addDomain('reddit.com');
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', {
        force: true,
        reason: 'domain list changed',
      });
    });

    it('does not call applyMode when mode is unblocked', async () => {
      mockCalculateTargetMode.mockReturnValue('unblocked');
      await domainService.addDomain('reddit.com');
      expect(mockApplyMode).not.toHaveBeenCalled();
    });

    it('rolls back on generate-system-config failure', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('script failed'));
      const originalRaw = JSON.stringify(sampleConfig);
      mockFs.readFileSync.mockReturnValue(originalRaw);

      await expect(domainService.addDomain('reddit.com')).rejects.toThrow('Failed to regenerate system config');

      // Second writeFileSync call should be the rollback
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
      const rollbackCall = mockFs.writeFileSync.mock.calls[1];
      expect(rollbackCall[1]).toBe(originalRaw);
    });
  });

  describe('removeDomain', () => {
    it('removes an existing domain', async () => {
      const result = await domainService.removeDomain('facebook.com');
      expect(result.expandedDomains).toBeDefined();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('throws 400 for invalid domain', async () => {
      await expect(domainService.removeDomain('!!!!')).rejects.toThrow('Invalid domain format');
    });

    it('throws 404 for non-existent domain', async () => {
      try {
        await domainService.removeDomain('nonexistent.com');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as any).statusCode).toBe(404);
      }
    });
  });

  describe('invalidateDomainCache', () => {
    it('forces cache reload on next read', () => {
      // First call caches
      domainService.getExpandedDomains();
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

      // Second call uses cache
      domainService.getExpandedDomains();
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

      // Invalidate + third call re-reads
      domainService.invalidateDomainCache();
      domainService.getExpandedDomains();
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
