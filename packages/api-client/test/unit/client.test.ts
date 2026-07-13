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
  it('POST avec un corps JSON { domain, tags }', async () => {
    const fetchMock = mockFetch({ status: 201 });

    await createFocusApiClient({ baseUrl: BASE }).addDomain('test.com', ['social']);

    const init = calledInit(fetchMock);
    expect(calledUrl(fetchMock)).toBe('http://localhost:5959/api/v1/focus/domains');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ domain: 'test.com', tags: ['social'] });
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
