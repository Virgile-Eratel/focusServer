import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DomainsConfig } from '../../../src/types/domains';

describe('domain.service', () => {
  let domainService: typeof import('../../../src/services/domain.service');

  let mockReadFileSync: ReturnType<typeof vi.fn>;
  let mockWriteFileAtomic: ReturnType<typeof vi.fn>;
  let mockGenerateSystemFiles: ReturnType<typeof vi.fn>;
  let mockApplyMode: ReturnType<typeof vi.fn>;
  let mockCalculateTargetMode: ReturnType<typeof vi.fn>;
  let mockIsScheduledPause: ReturnType<typeof vi.fn>;

  const sampleConfig: DomainsConfig = {
    version: 2,
    defaults: { includeWww: true, includeMobile: false },
    entries: [
      { domain: 'porn.com', category: 'adult', source: 'manual' },
      { domain: 'youtube.com', category: 'entertainment', source: 'manual', aliases: ['youtu.be'] },
    ],
  };

  /** Contenu courant de domains.json vu par le service. */
  function setFileContent(config: DomainsConfig | object): string {
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
    mockIsScheduledPause = vi.fn().mockReturnValue(false);

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

    vi.doMock('../../../src/services/scheduleService', () => ({
      isScheduledPause: mockIsScheduledPause,
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

      setFileContent({
        ...sampleConfig,
        entries: [{ domain: 'reddit.com', category: 'entertainment', source: 'manual' }],
      });

      expect(domainService.getDomainEntries()).toEqual([
        { domain: 'reddit.com', category: 'entertainment', source: 'manual' },
      ]);
    });

    it('expands entries into hostnames', () => {
      expect(domainService.getExpandedDomains()).toContain('www.youtube.com');
    });

    it('lit un fichier v1 en le migrant en mémoire', () => {
      setFileContent({
        version: 1,
        defaults: { includeWww: true },
        entries: [
          { domain: 'porn.com', tags: ['adult'] },
          { domain: 'youtube.com', tags: ['video'] },
          { domain: 'example.com' },
        ],
      });

      expect(domainService.getDomainEntries()).toEqual([
        { domain: 'porn.com', category: 'adult', source: 'manual' },
        { domain: 'youtube.com', category: 'entertainment', source: 'manual' },
        { domain: 'example.com', category: 'other', source: 'manual' },
      ]);
    });
  });

  describe('getBlockedHostnames', () => {
    it('hors pause : adult + entertainment', () => {
      mockIsScheduledPause.mockReturnValue(false);
      const result = domainService.getBlockedHostnames();
      expect(result).toContain('porn.com');
      expect(result).toContain('youtube.com');
      expect(result).toContain('youtu.be');
    });

    it('en pause : adult seulement', () => {
      mockIsScheduledPause.mockReturnValue(true);
      const result = domainService.getBlockedHostnames();
      expect(result).toContain('porn.com');
      expect(result).not.toContain('youtube.com');
    });

    it('les entrées other ne sont jamais bloquées', () => {
      setFileContent({
        ...sampleConfig,
        entries: [{ domain: 'github.com', category: 'other', source: 'ollama' }],
      });
      expect(domainService.getBlockedHostnames()).toEqual([]);
    });
  });

  describe('findEntryByRegistrableDomain', () => {
    it('trouve une entrée par son domaine', () => {
      expect(domainService.findEntryByRegistrableDomain('youtube.com')?.domain).toBe('youtube.com');
    });

    it('trouve une entrée par un alias', () => {
      expect(domainService.findEntryByRegistrableDomain('youtu.be')?.domain).toBe('youtube.com');
    });

    it('retourne null pour un domaine inconnu', () => {
      expect(domainService.findEntryByRegistrableDomain('unknown.com')).toBeNull();
    });
  });

  describe('migrateDomainsFileIfNeeded', () => {
    it('réécrit un fichier v1 en v2, une seule fois', async () => {
      setFileContent({
        version: 1,
        defaults: { includeWww: true },
        entries: [{ domain: 'porn.com', tags: ['adult'] }],
      });

      await domainService.migrateDomainsFileIfNeeded();

      expect(mockWriteFileAtomic).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.version).toBe(2);
      expect(written.entries[0]).toEqual({ domain: 'porn.com', category: 'adult', source: 'manual' });
    });

    it('ne touche pas un fichier déjà en v2', async () => {
      await domainService.migrateDomainsFileIfNeeded();
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
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

      setFileContent({
        ...sampleConfig,
        entries: [{ domain: 'reddit.com', category: 'entertainment', source: 'manual' }],
      });
      await domainService.syncSystemFilesIfChanged();

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(2);
      expect(mockApplyMode).toHaveBeenLastCalledWith('blocked', {
        force: true,
        reason: 'domains.json changed',
      });
    });

    it('applique AUSSI en mode unblocked — les fichiers unblocked portent les adult', async () => {
      // Un site adulte classé pendant une pause doit atteindre /etc/hosts
      // immédiatement, pas à la prochaine bascule de mode (~90 min de trou).
      mockCalculateTargetMode.mockReturnValue('unblocked');
      await domainService.syncSystemFilesIfChanged();
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('unblocked', { force: true, reason: 'startup' });
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
      const result = await domainService.addDomain('reddit.com', 'entertainment');

      expect(result.entry).toEqual({ domain: 'reddit.com', category: 'entertainment', source: 'manual' });
      expect(result.expandedDomains).toContain('reddit.com');

      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.entries.map((e) => e.domain)).toContain('reddit.com');

      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', { force: true, reason: 'domain added' });
    });

    it('catégorie par défaut : entertainment', async () => {
      const result = await domainService.addDomain('reddit.com');
      expect(result.entry.category).toBe('entertainment');
    });

    it('trace la source ollama pour les ajouts du classifieur', async () => {
      const result = await domainService.addDomain('dailymotion.com', 'entertainment', 'ollama');
      expect(result.entry.source).toBe('ollama');
      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.entries.at(-1)).toMatchObject({ source: 'ollama' });
    });

    it('applique aussi pendant une pause (mode unblocked)', async () => {
      mockCalculateTargetMode.mockReturnValue('unblocked');
      await domainService.addDomain('reddit.com');
      expect(mockGenerateSystemFiles).toHaveBeenCalledTimes(1);
      expect(mockApplyMode).toHaveBeenCalledWith('unblocked', { force: true, reason: 'domain added' });
    });

    it('throws 400 for an invalid domain', async () => {
      await expect(domainService.addDomain('not valid!')).rejects.toThrow('Invalid domain format');
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('throws 400 for an invalid category', async () => {
      await expect(domainService.addDomain('reddit.com', 'gaming' as never)).rejects.toMatchObject({ statusCode: 400 });
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('throws 409 for a duplicate domain', async () => {
      await expect(domainService.addDomain('porn.com')).rejects.toMatchObject({ statusCode: 409 });
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

  describe('overrideAiDomain — la soupape, et ses deux verrous', () => {
    /** Un verdict de l'IA : c'est le SEUL cas corrigeable depuis le navigateur. */
    const withAiEntry = (category: 'entertainment' | 'adult') =>
      setFileContent({
        ...sampleConfig,
        entries: [...sampleConfig.entries, { domain: 'tiime.fr', category, source: 'ollama' }],
      });

    it('corrige un verdict IA « entertainment » → other, et l’entrée devient manuelle', async () => {
      // Le tort que l'IA peut causer, et le seul qu'on lui laisse défaire : un
      // logiciel de compta rangé en divertissement. L'entrée corrigée passe en
      // `manual` — elle fait autorité et ne sera plus jamais re-classifiée.
      withAiEntry('entertainment');

      const result = await domainService.overrideAiDomain('tiime.fr', 'other');

      expect(result.entry).toEqual({ domain: 'tiime.fr', category: 'other', source: 'manual' });
      const written = JSON.parse(mockWriteFileAtomic.mock.calls[0][1]) as DomainsConfig;
      expect(written.entries.find((e) => e.domain === 'tiime.fr')).toMatchObject({
        category: 'other',
        source: 'manual',
      });
      expect(mockApplyMode).toHaveBeenCalledWith('blocked', { force: true, reason: 'ai verdict overridden' });
    });

    it('REFUSE de lever un blocage adulte, même posé par l’IA (403)', async () => {
      // Non négociable : c'est ici que le bloqueur deviendrait sa propre porte
      // de sortie. Un faux positif adulte se corrige à froid, dans domains.json.
      withAiEntry('adult');

      await expect(domainService.overrideAiDomain('tiime.fr', 'other')).rejects.toMatchObject({ statusCode: 403 });
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('REFUSE de toucher à une entrée manuelle (403)', async () => {
      // `youtube.com` a été bloqué par l'humain, à froid. Le défaire demande
      // d'éditer domains.json — la friction est le mécanisme, pas un oubli.
      await expect(domainService.overrideAiDomain('youtube.com', 'other')).rejects.toMatchObject({ statusCode: 403 });
      expect(mockWriteFileAtomic).not.toHaveBeenCalled();
    });

    it('404 sur un domaine absent de la liste', async () => {
      await expect(domainService.overrideAiDomain('inconnu.fr', 'other')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('400 sur une catégorie invalide', async () => {
      withAiEntry('entertainment');
      await expect(domainService.overrideAiDomain('tiime.fr', 'work' as unknown as 'other')).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('removeDomain', () => {
    it('removes an existing domain and regenerates', async () => {
      const result = await domainService.removeDomain('porn.com');

      expect(result.expandedDomains).not.toContain('porn.com');
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
