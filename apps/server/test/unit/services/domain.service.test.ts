import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DomainsConfig } from '../../../src/types/domains';

describe('domain.service', () => {
  let domainService: typeof import('../../../src/services/domain.service');

  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockWriteFileAtomic: ReturnType<typeof vi.fn>;
  let mockGenerateSystemFiles: ReturnType<typeof vi.fn>;
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

  /** Contenu courant de domains.json vu par le service. */
  function setFileContent(config: DomainsConfig): string {
    const raw = JSON.stringify(config, null, 2) + '\n';
    mockReadFileSync.mockReturnValue(raw);
    return raw;
  }

  beforeEach(async () => {
    vi.resetModules();

    mockReadFileSync = vi.fn();
    mockWriteFileAtomic = vi.fn();
    mockGenerateSystemFiles = vi.fn();
    mockApplyMode = vi.fn().mockResolvedValue(true);
    mockCalculateTargetMode = vi.fn().mockReturnValue('blocked');

    setFileContent(sampleConfig);

    vi.doMock('fs', async (importActual) => {
      const actual = await importActual<typeof import('fs')>();
      return { ...actual, readFileSync: mockReadFileSync };
    });

    vi.doMock('../../../src/utils/atomicWrite', () => ({
      writeFileAtomic: mockWriteFileAtomic,
    }));

    vi.doMock('../../../src/services/systemConfig.service', async (importActual) => {
      const actual = await importActual<typeof import('../../../src/services/systemConfig.service')>();
      return { ...actual, generateSystemFiles: mockGenerateSystemFiles };
    });

    vi.doMock('../../../src/services/focus.service', () => ({
      applyMode: mockApplyMode,
      calculateTargetMode: mockCalculateTargetMode,
    }));

    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));

    domainService = await import('../../../src/services/domain.service');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reads (no cache)', () => {
    it('re-reads domains.json on every call', () => {
      domainService.getExpandedDomains();
      domainService.getExpandedDomains();
      domainService.getDomainEntries();
      expect(mockReadFileSync).toHaveBeenCalledTimes(3);
    });

    it('picks up an external edit immediately', () => {
      expect(domainService.getDomainEntries()).toHaveLength(2);

      setFileContent({ ...sampleConfig, entries: [{ domain: 'reddit.com' }] });

      expect(domainService.getDomainEntries()).toEqual([{ domain: 'reddit.com', tags: [] }]);
    });

    it('expands entries into hostnames', () => {
      expect(domainService.getExpandedDomains()).toContain('www.facebook.com');
    });

    it('returns an empty tags array when the entry has none', () => {
      setFileContent({ ...sampleConfig, entries: [{ domain: 'x.com' }] });
      expect(domainService.getDomainEntries()[0].tags).toEqual([]);
    });
  });

  describe('syncSystemFilesIfChanged', () => {
    it('regenerates on first run (system files may not match the file yet)', async () => {
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', { force: true, reason: 'startup' });
    });

    it('does nothing when the file is unchanged', async () => {
      await domainService.syncSystemFilesIfChanged();
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
    });

    it('regenerates and re-applies when the file changed', async () => {
      await domainService.syncSystemFilesIfChanged();

      setFileContent({ ...sampleConfig, entries: [{ domain: 'reddit.com' }] });
      await domainService.syncSystemFilesIfChanged();

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(2);
      expect(mockApplyMode).toHaveBeenLastCalledWith('blocked', {
        force: true,
        reason: 'domains.json changed',
      });
    });

    it('regenerates but does not apply while unblocked', async () => {
      mockCalculateTargetMode.mockReturnValue('unblocked');
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).not.toHaveBeenCalled();
    });

    it('never throws when domains.json is unreadable', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      await expect(domainService.syncSystemFilesIfChanged()).resolves.toBeUndefined();
      expect(mockGenerateSystemFiles).not.toHaveBeenCalled();
    });

    it('never throws on invalid JSON, and retries on the next tick', async () => {
      mockReadFileSync.mockReturnValue('{ not json');
      await expect(domainService.syncSystemFilesIfChanged()).resolves.toBeUndefined();

      setFileContent(sampleConfig);
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
    });

    it('retries while the apply does not go through (/etc is not in sync yet)', async () => {
      mockApplyMode.mockResolvedValue(false);

      await domainService.syncSystemFilesIfChanged();
      await domainService.syncSystemFilesIfChanged();

      // Contenu inchangé, mais la machine n'a pas suivi : on ne doit pas
      // considérer la synchro comme faite.
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(2);
      expect(mockApplyMode).toHaveBeenCalledTimes(2);
    });

    it('stops retrying once the apply succeeds', async () => {
      mockApplyMode.mockResolvedValueOnce(false).mockResolvedValue(true);

      await domainService.syncSystemFilesIfChanged();
      await domainService.syncSystemFilesIfChanged();
      await domainService.syncSystemFilesIfChanged();

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(2);
    });
  });

  describe('addDomain', () => {
    it('writes the file, regenerates and force-applies', async () => {
      const result = await domainService.addDomain('reddit.com', ['social']);

      expect(result.entry).toEqual({ domain: 'reddit.com', tags: ['social'] });
      expect(result.expandedDomains).toContain('reddit.com');

      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.entries.map((e) => e.domain)).toContain('reddit.com');

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', { force: true, reason: 'domain added' });
    });

    it('does not apply while unblocked — the files are enough', async () => {
      mockCalculateTargetMode.mockReturnValue('unblocked');
      await domainService.addDomain('reddit.com');
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).not.toHaveBeenCalled();
    });

    it('throws 400 for an invalid domain', async () => {
      await expect(domainService.addDomain('not valid!')).rejects.toThrow('Invalid domain format');
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('throws 409 for a duplicate domain', async () => {
      await expect(domainService.addDomain('facebook.com')).rejects.toMatchObject({ statusCode: 409 });
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('rolls back domains.json when generation fails', async () => {
      const originalRaw = setFileContent(sampleConfig);
      mockGenerateSystemFiles.mockImplementation(() => {
        throw new Error('disk full');
      });

      await expect(domainService.addDomain('reddit.com')).rejects.toThrow('Failed to regenerate system config');

      expect(mockWriteFileAtomic).toHaveBeenCalledTimes(2);
      expect(mockWriteFileAtomic.mock.calls[1][1]).toBe(originalRaw);
    });

    it('forces a full resync on the next tick after a failed generation', async () => {
      mockGenerateSystemFiles.mockImplementationOnce(() => {
        throw new Error('disk full');
      });
      await expect(domainService.addDomain('reddit.com')).rejects.toThrow();

      // Le fichier est revenu à son contenu d'origine : sans invalidation
      // explicite, une comparaison d'empreinte pourrait conclure « rien à faire ».
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeDomain', () => {
    it('removes an existing domain and regenerates', async () => {
      const result = await domainService.removeDomain('facebook.com');

      expect(result.expandedDomains).not.toContain('facebook.com');
      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.entries.map((e) => e.domain)).toEqual(['youtube.com']);

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', { force: true, reason: 'domain removed' });
    });

    it('throws 400 for an invalid domain', async () => {
      await expect(domainService.removeDomain('!!!!')).rejects.toThrow('Invalid domain format');
    });

    it('throws 404 for an unknown domain', async () => {
      await expect(domainService.removeDomain('nonexistent.com')).rejects.toMatchObject({ statusCode: 404 });
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });
  });
});
