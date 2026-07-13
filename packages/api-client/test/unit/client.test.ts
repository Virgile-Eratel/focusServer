import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFocusApiClient, FocusApiError } from '../../src/client';

const BASE = 'http://localhost:5959';

function mockFetch(response: Partial<Response> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  } as Response);

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** URL passée au dernier appel de fetch. */
const calledUrl = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0][0] as string;
const calledInit = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0][1] as RequestInit;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createFocusApiClient — construction des URLs', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
  });

  it('/health est à la racine, pas sous /api/v1/focus', async () => {
    await createFocusApiClient({ baseUrl: BASE }).getHealth();

    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/health');
  });

  it('les routes focus sont préfixées par /api/v1/focus', async () => {
    await createFocusApiClient({ baseUrl: BASE }).getStatus();

    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/status');
  });

  it('getDomains et getDomainEntries visent des routes distinctes', async () => {
    const client = createFocusApiClient({ baseUrl: BASE });

    await client.getDomains();
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains');

    fetchMock.mockClear();
    await client.getDomainEntries();
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains/entries');
  });

  it('un slash final dans baseUrl ne produit pas de double slash', async () => {
    await createFocusApiClient({ baseUrl: `${BASE}/` }).getStatus();

    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/status');
  });

  it('removeDomain encode le domaine dans le chemin', async () => {
    await createFocusApiClient({ baseUrl: BASE }).removeDomain('sous.domaine.com');

    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains/sous.domaine.com');
    expect(calledInit(fetchMock).method).toBe('DELETE');
  });
});

describe('createFocusApiClient — addDomain', () => {
  it('POST avec un corps JSON { domain, category }', async () => {
    const fetchMock = mockFetch({ status: 201 });

    await createFocusApiClient({ baseUrl: BASE }).addDomain('test.com', 'entertainment');

    const init = calledInit(fetchMock);
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      domain: 'test.com',
      category: 'entertainment',
    });
  });

  it('sans catégorie, le corps ne porte que le domaine (défaut serveur)', async () => {
    const fetchMock = mockFetch({ status: 201 });

    await createFocusApiClient({ baseUrl: BASE }).addDomain('test.com');

    expect(JSON.parse(calledInit(fetchMock).body as string)).toEqual({ domain: 'test.com' });
  });
});

describe('createFocusApiClient — overrideDomain', () => {
  it('PUT { category } sur le domaine, encodé dans le chemin', async () => {
    const fetchMock = mockFetch({ status: 200 });

    await createFocusApiClient({ baseUrl: BASE }).overrideDomain('sous.domaine.com', 'other');

    const init = calledInit(fetchMock);
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains/sous.domaine.com');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ category: 'other' });
  });
});

describe('createFocusApiClient — classify et verdicts', () => {
  it('classify POST { url } vers /classify', async () => {
    const fetchMock = mockFetch();

    await createFocusApiClient({ baseUrl: BASE }).classify('https://dailymotion.com/video');

    const init = calledInit(fetchMock);
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/classify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://dailymotion.com/video' });
  });

  it('classify accepte un timeout par appel supérieur au défaut du client', async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );

    const client = createFocusApiClient({ baseUrl: BASE, timeoutMs: 1000 });
    let settled = false;
    const promise = client.classify('https://example.com', { timeoutMs: 25_000 }).finally(() => (settled = true));
    const assertion = expect(promise).rejects.toThrow('aborted');

    // Au-delà du timeout client (1 s) mais sous le timeout par appel : toujours en vol.
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;

    vi.useRealTimers();
  });

  it('getRecentVerdicts encode la limite en query string', async () => {
    const fetchMock = mockFetch();
    const client = createFocusApiClient({ baseUrl: BASE });

    await client.getRecentVerdicts();
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/verdicts/recent');

    fetchMock.mockClear();
    await client.getRecentVerdicts(10);
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/verdicts/recent?limit=10');
  });

  it('deleteVerdict encode le domaine dans le chemin', async () => {
    const fetchMock = mockFetch();

    await createFocusApiClient({ baseUrl: BASE }).deleteVerdict('sous.domaine.com');

    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/verdicts/sous.domaine.com');
    expect(calledInit(fetchMock).method).toBe('DELETE');
  });
});

describe('createFocusApiClient — erreurs', () => {
  it('une réponse non-2xx lève une FocusApiError portant le code HTTP', async () => {
    mockFetch({ ok: false, status: 409 });

    const promise = createFocusApiClient({ baseUrl: BASE }).addDomain('test.com');

    await expect(promise).rejects.toBeInstanceOf(FocusApiError);
    await expect(promise).rejects.toMatchObject({ status: 409 });
  });

  it('une erreur réseau remonte telle quelle (pas une FocusApiError)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const promise = createFocusApiClient({ baseUrl: BASE }).getStatus();

    await expect(promise).rejects.toBeInstanceOf(TypeError);
  });

  it('la requête est abandonnée au-delà du timeout', async () => {
    vi.useFakeTimers();

    // fetch qui ne répond jamais, mais qui rejette quand le signal est abandonné.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );

    const promise = createFocusApiClient({ baseUrl: BASE, timeoutMs: 1000 }).getStatus();
    const assertion = expect(promise).rejects.toThrow('aborted');

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    vi.useRealTimers();
  });
});
