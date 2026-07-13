import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ollama.service', () => {
  let ollamaService: typeof import('../../../src/services/ollama.service');
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Réponse structurée d'Ollama : la clé varie selon l'appel (verdict / category). */
  function mockAnswer(payload: Record<string, string>) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: JSON.stringify(payload) } }),
    } as Response);
  }

  const bodyOf = (call = 0) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);

  const evidence = {
    title: 'noTube — convertisseur YouTube',
    description: null,
    ogTitle: null,
    ogDescription: null,
  };

  beforeEach(async () => {
    vi.resetModules();
    process.env.OLLAMA_MODEL = 'test-model';
    process.env.OLLAMA_URL = 'http://localhost:11434';

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    vi.doMock('../../../src/utils/logger', () => ({
      createChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
    }));

    ollamaService = await import('../../../src/services/ollama.service');
  });

  afterEach(() => {
    delete process.env.OLLAMA_MODEL;
    delete process.env.OLLAMA_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envoie une requête structurée : modèle env, temperature 0, sortie contrainte', async () => {
    mockAnswer({ verdict: 'no_explicit_wording', evidence: '' });

    await ollamaService.screenDomainName('dailymotion.com');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.anything());
    const body = bodyOf();
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    expect(body.options).toEqual({ temperature: 0 });
    expect(body.messages[1].content).toContain('dailymotion.com');
  });

  describe('screenDomainName — étape 1 : un filtre de vocabulaire, pas une catégorisation', () => {
    it('ne propose au modèle QUE le verdict de vocabulaire (aucune catégorie à deviner)', async () => {
      // Le cœur de la correction : un 4B invente une catégorie pour n'importe
      // quel nom inconnu (popr.ink → adult). On ne lui laisse plus ce choix.
      mockAnswer({ verdict: 'no_explicit_wording', evidence: '' });

      await ollamaService.screenDomainName('popr.ink');

      const schema = bodyOf().format;
      expect(bodyOf().format.properties.verdict.enum).toEqual(['explicit_adult_wording', 'no_explicit_wording']);
      expect(JSON.stringify(schema)).not.toContain('entertainment');
    });

    it('vocabulaire explicite CITÉ et présent dans le nom → adult (page non chargée)', async () => {
      mockAnswer({ verdict: 'explicit_adult_wording', evidence: 'sexy' });
      expect(await ollamaService.screenDomainName('sexyclips.net')).toEqual({
        ok: true,
        explicitAdult: true,
      });
    });

    it('nom sans vocabulaire sexuel → la page devra être lue', async () => {
      mockAnswer({ verdict: 'no_explicit_wording', evidence: '' });
      expect(await ollamaService.screenDomainName('virgilemarty.fr')).toEqual({
        ok: true,
        explicitAdult: false,
      });
    });

    it('mot allégué ABSENT du nom → hallucination rejetée, la page sera lue', async () => {
      // Le garde-fou déterministe : le modèle a « vu » porn dans popr.ink.
      mockAnswer({ verdict: 'explicit_adult_wording', evidence: 'porn' });
      expect(await ollamaService.screenDomainName('popr.ink')).toEqual({
        ok: true,
        explicitAdult: false,
      });
    });

    it('citation vide ou trop courte → rejetée', async () => {
      mockAnswer({ verdict: 'explicit_adult_wording', evidence: '' });
      expect(await ollamaService.screenDomainName('popr.ink')).toMatchObject({ explicitAdult: false });

      mockAnswer({ verdict: 'explicit_adult_wording', evidence: 'x' });
      expect(await ollamaService.screenDomainName('x-files.com')).toMatchObject({ explicitAdult: false });
    });

    it('la citation tolère la ponctuation du domaine', async () => {
      mockAnswer({ verdict: 'explicit_adult_wording', evidence: 'xhamster' });
      expect(await ollamaService.screenDomainName('x-hamster.com')).toMatchObject({ explicitAdult: true });
    });
  });

  describe('classifyWithEvidence — étape 2 : le chemin normal', () => {
    it('choix forcé à 3 voies, page encadrée comme donnée non fiable', async () => {
      mockAnswer({ purpose: 'convert YouTube videos to MP3', category: 'other' });

      const result = await ollamaService.classifyWithEvidence('notube.lol', evidence);

      expect(result).toEqual({ ok: true, category: 'other' });
      const body = bodyOf();
      expect(body.format.properties.category.enum).toEqual(['adult', 'entertainment', 'other']);
      expect(body.messages[1].content).toContain('UNTRUSTED PAGE DATA');
      // Un outil lié aux médias n'est pas du divertissement : la frontière que
      // le modèle rate sans cette consigne (notube classé adult, giphy en jeu).
      expect(body.messages[0].content).toMatch(/TOOL or UTILITY/i);
      expect(body.messages[0].content).toMatch(/ANY\s+game/i);
    });

    it('exige l’USAGE avant la catégorie, et dans cet ordre', async () => {
      // L'ordre des propriétés du schéma EST l'ordre de génération : forcé
      // d'écrire « logiciel de facturation pour indépendants », le modèle ne
      // peut plus conclure « divertissement ». C'est ce qui a corrigé
      // `monkeytype`. Si `purpose` repassait après `category`, le garde-fou
      // tomberait sans que rien n'échoue par ailleurs.
      mockAnswer({ purpose: 'invoicing software for freelancers', category: 'other' });
      await ollamaService.classifyWithEvidence('tiime.fr', evidence);

      const properties = Object.keys(bodyOf().format.properties);
      expect(properties).toEqual(['purpose', 'category']);
      expect(bodyOf().format.required).toContain('purpose');
    });

    it('rejette une catégorie hors énumération', async () => {
      mockAnswer({ purpose: 'social network', category: 'work' });
      expect(await ollamaService.classifyWithEvidence('x.com', evidence)).toEqual({
        ok: false,
        reason: 'invalid_response',
      });
    });
  });

  describe('descriptionsAgree — les tirages parlent-ils du même site ?', () => {
    it('un mot porteur commun suffit', () => {
      expect(ollamaService.descriptionsAgree(['video platform', 'video platform', 'video sharing platform'])).toBe(
        true,
      );
      expect(ollamaService.descriptionsAgree(['social networking', 'social media platform'])).toBe(true);
    });

    it('trois inventions différentes ne s’accordent pas — même unanimes de catégorie', () => {
      // Le cas `motherless.com` (site porno) : trois descriptions inventées,
      // toutes rangées en « entertainment », donc unanimes par accident. Sans
      // ce test d'accord, il ressortait « divertissement » — donc accessible
      // à chaque fenêtre de pause.
      expect(
        ollamaService.descriptionsAgree([
          'online dating platform',
          'community forum for single mothers',
          'social network for grieving individuals',
        ]),
      ).toBe(false);
    });

    it('les mots creux ne prouvent aucun accord', () => {
      // « platform », « online », « website » remplissent toutes les
      // descriptions : trois inventions sans rapport les partagent.
      expect(ollamaService.descriptionsAgree(['online platform', 'popular website', 'free service'])).toBe(false);
    });

    it('une description vide interdit l’accord', () => {
      expect(ollamaService.descriptionsAgree(['video platform', '', 'video platform'])).toBe(false);
    });
  });

  describe('classifyDomainByKnowledge — page illisible ou muette : la constance fait preuve', () => {
    /** Une réponse différente par tirage. */
    function mockDraws(...draws: Record<string, string>[]) {
      for (const draw of draws) {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: { content: JSON.stringify(draw) } }),
        } as Response);
      }
    }

    it('interroge le modèle plusieurs fois, à température non nulle et graines distinctes', async () => {
      // Un seul tirage à température 0 ne distingue pas la connaissance de
      // l'invention : le modèle est toujours sûr de lui. C'est la DIVERGENCE
      // entre tirages qui trahit l'invention — encore faut-il les laisser
      // diverger.
      mockDraws(
        { known_for: 'anime streaming platform', category: 'entertainment' },
        { known_for: 'anime streaming platform', category: 'entertainment' },
        { known_for: 'anime streaming service', category: 'entertainment' },
      );

      const result = await ollamaService.classifyDomainByKnowledge('crunchyroll.com');

      expect(result).toEqual({ ok: true, category: 'entertainment' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const temperatures = [0, 1, 2].map((call) => bodyOf(call).options.temperature);
      const seeds = [0, 1, 2].map((call) => bodyOf(call).options.seed);
      expect(temperatures.every((temperature) => temperature > 0)).toBe(true);
      expect(new Set(seeds).size).toBe(3);
    });

    it('un seul tirage « adult » suffit — asymétrie de sûreté', async () => {
      mockDraws(
        { known_for: 'subscription content platform', category: 'other' },
        { known_for: 'adult content platform', category: 'adult' },
        { known_for: 'creators platform', category: 'other' },
      );
      expect(await ollamaService.classifyDomainByKnowledge('onlyfans.com')).toEqual({
        ok: true,
        category: 'adult',
      });
    });

    it('unanime « entertainment » MAIS descriptions incohérentes → unsure', async () => {
      mockDraws(
        { known_for: 'online dating platform', category: 'entertainment' },
        { known_for: 'community forum for single mothers', category: 'entertainment' },
        { known_for: 'social network for grieving individuals', category: 'entertainment' },
      );
      expect(await ollamaService.classifyDomainByKnowledge('motherless.com')).toEqual({
        ok: true,
        category: 'unsure',
      });
    });

    it('un tirage qui hésite casse l’unanimité → unsure', async () => {
      // `popr.ink` : « meme generator », puis « AI chatbot », puis rien. Le
      // modèle ne connaît pas ce blog — il le devine, différemment à chaque
      // fois. ⇒ unknown ⇒ NON bloqué.
      mockDraws(
        { known_for: 'meme generator', category: 'entertainment' },
        { known_for: 'AI-powered chatbot', category: 'other' },
        { known_for: '', category: 'entertainment' },
      );
      expect(await ollamaService.classifyDomainByKnowledge('popr.ink')).toEqual({
        ok: true,
        category: 'unsure',
      });
    });

    it('aucune description → unsure, quoi que dise la catégorie', async () => {
      // Ne pas savoir décrire, c'est ne pas connaître. Le modèle ne s'abstient
      // jamais spontanément : il faut lui arracher l'aveu.
      mockAnswer({ known_for: '', category: 'other' });
      expect(await ollamaService.classifyDomainByKnowledge('gifer.com')).toEqual({
        ok: true,
        category: 'unsure',
      });
    });

    it('propose bien « unsure » dans l’énumération', async () => {
      mockAnswer({ known_for: '', category: 'unsure' });
      await ollamaService.classifyDomainByKnowledge('inconnu.xyz');
      expect(bodyOf().format.properties.category.enum).toEqual(['adult', 'entertainment', 'other', 'unsure']);
    });

    it('une panne pendant un tirage fait échouer l’ensemble', async () => {
      mockDraws({ known_for: 'video platform', category: 'entertainment' });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
      expect(await ollamaService.classifyDomainByKnowledge('dailymotion.com')).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    });
  });

  describe('pannes — tout échec devient un unknown côté classifieur', () => {
    it('rejette un contenu non-JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'je pense que…' } }),
      } as Response);
      expect(await ollamaService.classifyWithEvidence('x.com', evidence)).toEqual({
        ok: false,
        reason: 'invalid_response',
      });
    });

    it('Ollama éteint → unavailable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      expect(await ollamaService.screenDomainName('x.com')).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    });

    it('réponse HTTP non-2xx → unavailable', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
      expect(await ollamaService.classifyWithEvidence('x.com', evidence)).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    });

    it('abandon au timeout → timeout', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      fetchMock.mockRejectedValue(abortError);
      expect(await ollamaService.screenDomainName('x.com')).toEqual({
        ok: false,
        reason: 'timeout',
      });
    });
  });
});
