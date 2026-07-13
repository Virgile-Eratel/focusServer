import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('classifier.service', () => {
  let classifier: typeof import('../../../src/services/classifier.service');

  let mockFindEntry: ReturnType<typeof vi.fn>;
  let mockAddDomain: ReturnType<typeof vi.fn>;
  let mockGetVerdict: ReturnType<typeof vi.fn>;
  let mockSaveVerdict: ReturnType<typeof vi.fn>;
  let mockDeleteVerdict: ReturnType<typeof vi.fn>;
  let mockListUnknown: ReturnType<typeof vi.fn>;
  let mockScreenDomainName: ReturnType<typeof vi.fn>;
  let mockClassifyWithEvidence: ReturnType<typeof vi.fn>;
  let mockClassifyByKnowledge: ReturnType<typeof vi.fn>;
  let mockFetchPageEvidence: ReturnType<typeof vi.fn>;
  let mockIsScheduledPause: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    mockFindEntry = vi.fn().mockReturnValue(null);
    mockAddDomain = vi.fn().mockResolvedValue({});
    mockGetVerdict = vi.fn().mockReturnValue(null);
    mockSaveVerdict = vi.fn();
    mockDeleteVerdict = vi.fn().mockReturnValue(true);
    mockListUnknown = vi.fn().mockReturnValue([]);
    // Défaut : le nom ne contient pas de vocabulaire porno → la page est lue.
    mockScreenDomainName = vi.fn().mockResolvedValue({ ok: true, explicitAdult: false });
    mockClassifyWithEvidence = vi.fn();
    mockClassifyByKnowledge = vi.fn();
    mockFetchPageEvidence = vi.fn();
    mockIsScheduledPause = vi.fn().mockReturnValue(false);

    vi.doMock('../../../src/services/domain.service', () => ({
      addDomain: mockAddDomain,
      findEntryByRegistrableDomain: mockFindEntry,
    }));
    vi.doMock('../../../src/services/verdict.service', () => ({
      getVerdict: mockGetVerdict,
      saveVerdict: mockSaveVerdict,
      deleteVerdict: mockDeleteVerdict,
      listUnknownVerdicts: mockListUnknown,
    }));
    vi.doMock('../../../src/services/ollama.service', () => ({
      screenDomainName: mockScreenDomainName,
      classifyWithEvidence: mockClassifyWithEvidence,
      classifyDomainByKnowledge: mockClassifyByKnowledge,
    }));
    // `saysMoreThanItsName` reste la VRAIE fonction : c'est elle qui décide du
    // chemin (page qui parle / page muette), et la mocker reviendrait à ne
    // jamais tester l'aiguillage — précisément là où `tiime.fr` a déraillé.
    vi.doMock('../../../src/services/pageFetcher.service', async () => {
      const actual = await vi.importActual<typeof import('../../../src/services/pageFetcher.service')>(
        '../../../src/services/pageFetcher.service',
      );
      return { ...actual, fetchPageEvidence: mockFetchPageEvidence };
    });
    vi.doMock('../../../src/services/scheduleService', () => ({
      isScheduledPause: mockIsScheduledPause,
    }));
    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));

    classifier = await import('../../../src/services/classifier.service');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classifyUrl — validation', () => {
    it('rejette une URL invalide en 400', async () => {
      await expect(classifier.classifyUrl('not a url')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejette un schéma non http(s) en 400', async () => {
      await expect(classifier.classifyUrl('ftp://example.com')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejette une IP ou localhost en 400 (pas de domaine enregistrable)', async () => {
      await expect(classifier.classifyUrl('http://192.168.1.1/')).rejects.toMatchObject({ statusCode: 400 });
      await expect(classifier.classifyUrl('http://localhost:5959/')).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('classifyUrl — priorités des sources', () => {
    it('domains.json d’abord : aucun appel Ollama, aucun verdict écrit', async () => {
      mockFindEntry.mockReturnValue({ domain: 'youtube.com', category: 'entertainment', source: 'manual' });

      const outcome = await classifier.classifyUrl('https://www.youtube.com/watch?v=x');

      expect(outcome).toEqual({
        domain: 'youtube.com',
        category: 'entertainment',
        blocked: true,
        source: 'manual',
      });
      expect(mockGetVerdict).not.toHaveBeenCalled();
      expect(mockScreenDomainName).not.toHaveBeenCalled();
      expect(mockSaveVerdict).not.toHaveBeenCalled();
    });

    it('verdict connu ensuite : aucun appel Ollama', async () => {
      mockGetVerdict.mockReturnValue({
        domain: 'github.com',
        category: 'other',
        source: 'ollama',
        decidedAt: '2026-07-13T10:00:00.000Z',
        evidence: null,
      });

      const outcome = await classifier.classifyUrl('https://github.com/some/repo');

      expect(outcome.blocked).toBe(false);
      expect(outcome.source).toBe('ollama');
      expect(mockScreenDomainName).not.toHaveBeenCalled();
    });

    it('la clé est l’eTLD+1 : un sous-domaine retombe sur le même verdict', async () => {
      mockGetVerdict.mockReturnValue({
        domain: 'xhamsterlive.com',
        category: 'adult',
        source: 'ollama',
        decidedAt: '2026-07-13T10:00:00.000Z',
        evidence: null,
      });

      const outcome = await classifier.classifyUrl('https://fr.xhamsterlive.com/');
      expect(mockGetVerdict).toHaveBeenCalledWith('xhamsterlive.com');
      expect(outcome.domain).toBe('xhamsterlive.com');
      expect(outcome.blocked).toBe(true);
    });
  });

  describe('classifyUrl — première visite : la page est le chemin NORMAL', () => {
    const EVIDENCE = { title: 'noTube', description: 'Convertisseur YouTube', ogTitle: null, ogDescription: null };

    it('nom sans vocabulaire porno → la page EST lue, et c’est elle qui tranche', async () => {
      // Le cœur de la correction : plus aucune catégorie devinée sur le nom.
      mockFetchPageEvidence.mockResolvedValue(EVIDENCE);
      mockClassifyWithEvidence.mockResolvedValue({ ok: true, category: 'other' });

      const outcome = await classifier.classifyUrl('https://notube.lol/');

      expect(mockFetchPageEvidence).toHaveBeenCalledWith('https://notube.lol/');
      expect(mockClassifyWithEvidence).toHaveBeenCalledWith('notube.lol', EVIDENCE);
      expect(outcome).toMatchObject({ category: 'other', blocked: false });
      expect(mockAddDomain).not.toHaveBeenCalled();
      expect(mockClassifyByKnowledge).not.toHaveBeenCalled();
    });

    it('vocabulaire porno dans le nom → adult SANS charger la page', async () => {
      // On ne va pas chercher une page porno pour se le confirmer (§3.4).
      mockScreenDomainName.mockResolvedValue({ ok: true, explicitAdult: true });

      const outcome = await classifier.classifyUrl('https://sexyclips.net/');

      expect(mockFetchPageEvidence).not.toHaveBeenCalled();
      expect(mockClassifyWithEvidence).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ category: 'adult', blocked: true });
      expect(mockAddDomain).toHaveBeenCalledWith('sexyclips.net', 'adult', 'ollama');
    });

    it('la page tranche adult → ajouté à la blocklist', async () => {
      mockFetchPageEvidence.mockResolvedValue(EVIDENCE);
      mockClassifyWithEvidence.mockResolvedValue({ ok: true, category: 'adult' });

      const outcome = await classifier.classifyUrl('https://example.com/page');

      expect(outcome.category).toBe('adult');
      expect(mockAddDomain).toHaveBeenCalledWith('example.com', 'adult', 'ollama');
    });

    it('page illisible → chemin « nom », et un nom vraiment connu tranche', async () => {
      // 403/429 anti-robot, site tout en JS… La page manque, mais le modèle
      // décrit `leboncoin` de la même façon à chaque tirage : il le connaît.
      mockFetchPageEvidence.mockResolvedValue(null);
      mockClassifyByKnowledge.mockResolvedValue({ ok: true, category: 'other' });

      const outcome = await classifier.classifyUrl('https://leboncoin.fr/');

      expect(mockClassifyByKnowledge).toHaveBeenCalledWith('leboncoin.fr');
      expect(outcome).toMatchObject({ category: 'other', blocked: false });
    });

    it('page vide de tout titre/méta → chemin « nom »', async () => {
      mockFetchPageEvidence.mockResolvedValue({ title: null, description: null, ogTitle: null, ogDescription: null });
      mockClassifyByKnowledge.mockResolvedValue({ ok: true, category: 'unsure' });

      const outcome = await classifier.classifyUrl('https://gifer.com/');

      expect(mockClassifyWithEvidence).not.toHaveBeenCalled();
      expect(mockClassifyByKnowledge).toHaveBeenCalled();
      expect(outcome).toMatchObject({ category: 'unknown', blocked: false });
    });

    it('page qui ne dit que sa marque = page muette → chemin « nom », JAMAIS la page', async () => {
      // LE bug de `tiime.fr` : la page ne renvoyait que « Tiime ». Le modèle,
      // sommé de classer, ne classait pas la page — il devinait le nom, et
      // devinait « divertissement ». Un logiciel de compta s'est retrouvé
      // bloqué. Une page qui ne fait qu'écho à sa marque n'est pas une preuve.
      mockFetchPageEvidence.mockResolvedValue({
        title: 'Tiime',
        description: null,
        ogTitle: null,
        ogDescription: null,
      });
      mockClassifyByKnowledge.mockResolvedValue({ ok: true, category: 'unsure' });

      const outcome = await classifier.classifyUrl('https://tiime.fr/');

      expect(mockClassifyWithEvidence).not.toHaveBeenCalled();
      expect(mockClassifyByKnowledge).toHaveBeenCalledWith('tiime.fr');
      expect(outcome).toMatchObject({ category: 'unknown', blocked: false });
    });

    it('page illisible + nom inconnu → unknown → NON bloqué (§3.5 révisée)', async () => {
      mockFetchPageEvidence.mockResolvedValue(null);
      mockClassifyByKnowledge.mockResolvedValue({ ok: true, category: 'unsure' });

      const outcome = await classifier.classifyUrl('https://popr.ink/');

      expect(outcome).toMatchObject({ category: 'unknown', blocked: false });
      expect(mockSaveVerdict).toHaveBeenCalledWith(expect.objectContaining({ category: 'unknown' }));
      expect(mockAddDomain).not.toHaveBeenCalled();
    });

    it('Ollama éteint dès le filtre → unknown, NON bloqué, aucun fetch', async () => {
      // Volontaire : `killall ollama` ne bloque plus tout le web. Il ne débloque
      // rien non plus — la blocklist de domains.json vit dans /etc/hosts et PF,
      // qu'aucune sortie de modèle ne touche (§3.3).
      mockScreenDomainName.mockResolvedValue({ ok: false, reason: 'unavailable' });

      const outcome = await classifier.classifyUrl('https://newsite.com/');

      expect(mockFetchPageEvidence).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ category: 'unknown', blocked: false });
      expect(mockSaveVerdict).toHaveBeenCalledWith(expect.objectContaining({ category: 'unknown' }));
    });

    it('Ollama tombe pendant l’étape 2 → unknown, NON bloqué', async () => {
      mockFetchPageEvidence.mockResolvedValue(EVIDENCE);
      mockClassifyWithEvidence.mockResolvedValue({ ok: false, reason: 'timeout' });

      await expect(classifier.classifyUrl('https://x-site.com/')).resolves.toMatchObject({
        category: 'unknown',
        blocked: false,
      });
    });

    it('entertainment pendant une pause → non bloqué maintenant, mais ajouté quand même', async () => {
      mockIsScheduledPause.mockReturnValue(true);
      mockFetchPageEvidence.mockResolvedValue(EVIDENCE);
      mockClassifyWithEvidence.mockResolvedValue({ ok: true, category: 'entertainment' });

      const outcome = await classifier.classifyUrl('https://dailymotion.com/');

      expect(outcome.blocked).toBe(false);
      expect(mockAddDomain).toHaveBeenCalled();
    });

    it('adult pendant une pause → bloqué quand même (aucune exception)', async () => {
      mockIsScheduledPause.mockReturnValue(true);
      mockScreenDomainName.mockResolvedValue({ ok: true, explicitAdult: true });

      await expect(classifier.classifyUrl('https://badsite.com/')).resolves.toMatchObject({ blocked: true });
    });

    it('avale le 409 (course perdue contre un ajout manuel)', async () => {
      mockScreenDomainName.mockResolvedValue({ ok: true, explicitAdult: true });
      const conflict = new Error('Domain already exists') as Error & { statusCode: number };
      conflict.statusCode = 409;
      mockAddDomain.mockRejectedValue(conflict);

      await expect(classifier.classifyUrl('https://sexyclips.net/')).resolves.toMatchObject({ blocked: true });
    });

    it('un échec de régénération ne casse pas la réponse : le verdict existe', async () => {
      mockScreenDomainName.mockResolvedValue({ ok: true, explicitAdult: true });
      mockAddDomain.mockRejectedValue(new Error('Failed to regenerate system config'));

      await expect(classifier.classifyUrl('https://badsite.com/')).resolves.toMatchObject({
        category: 'adult',
        blocked: true,
      });
    });

    it('coalesce les appels concurrents : une seule classification par domaine', async () => {
      let resolveScreen!: (value: unknown) => void;
      mockScreenDomainName.mockReturnValue(new Promise((resolve) => (resolveScreen = resolve)));

      const first = classifier.classifyUrl('https://dailymotion.com/a');
      const second = classifier.classifyUrl('https://www.dailymotion.com/b');

      resolveScreen({ ok: true, explicitAdult: true });
      const [a, b] = await Promise.all([first, second]);

      expect(mockScreenDomainName).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
    });
  });

  describe('retryUnknownVerdicts', () => {
    const unknownRow = (domain: string) => ({
      domain,
      category: 'unknown',
      source: 'ollama',
      decidedAt: '2026-07-12T00:00:00.000Z',
      evidence: null,
    });

    it('re-classe les unknown résolus et les ajoute si bloquables', async () => {
      mockListUnknown.mockReturnValue([unknownRow('was-down.com')]);
      mockScreenDomainName.mockResolvedValue({ ok: true, explicitAdult: true });

      await classifier.retryUnknownVerdicts();

      expect(mockSaveVerdict).toHaveBeenCalledWith(
        expect.objectContaining({ domain: 'was-down.com', category: 'adult' }),
      );
      expect(mockAddDomain).toHaveBeenCalledWith('was-down.com', 'adult', 'ollama');
    });

    it('la page redevenue lisible tranche à la re-tentative', async () => {
      // Le cas typique : 429 transitoire à la première visite.
      mockListUnknown.mockReturnValue([unknownRow('popr.ink')]);
      mockFetchPageEvidence.mockResolvedValue({
        title: 'Popr',
        description: 'Une page de liens pour créateurs',
        ogTitle: null,
        ogDescription: null,
      });
      mockClassifyWithEvidence.mockResolvedValue({ ok: true, category: 'other' });

      await classifier.retryUnknownVerdicts();

      expect(mockSaveVerdict).toHaveBeenCalledWith(expect.objectContaining({ domain: 'popr.ink', category: 'other' }));
      expect(mockAddDomain).not.toHaveBeenCalled();
    });

    it('garde le verdict unknown si Ollama est toujours indisponible', async () => {
      mockListUnknown.mockReturnValue([unknownRow('still-down.com')]);
      mockScreenDomainName.mockResolvedValue({ ok: false, reason: 'unavailable' });

      await classifier.retryUnknownVerdicts();

      expect(mockSaveVerdict).not.toHaveBeenCalled();
      expect(mockAddDomain).not.toHaveBeenCalled();
    });

    it('ne fait rien sans verdict unknown', async () => {
      await classifier.retryUnknownVerdicts();
      expect(mockScreenDomainName).not.toHaveBeenCalled();
    });

    it('un domaine listé entre-temps dans domains.json : verdict effacé, pas de re-classification', async () => {
      // domains.json fait autorité — re-classer un domaine listé écrirait un
      // verdict pour lui, ce que classifyDomain ne fait jamais.
      mockListUnknown.mockReturnValue([unknownRow('manually-added.com')]);
      mockFindEntry.mockReturnValue({ domain: 'manually-added.com', category: 'adult', source: 'manual' });

      await classifier.retryUnknownVerdicts();

      expect(mockDeleteVerdict).toHaveBeenCalledWith('manually-added.com');
      expect(mockScreenDomainName).not.toHaveBeenCalled();
      expect(mockSaveVerdict).not.toHaveBeenCalled();
    });
  });
});
