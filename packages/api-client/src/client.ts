import type {
  AddDomainRequest,
  AddDomainResponse,
  Category,
  ClassifyRequest,
  ClassifyResponse,
  DeleteVerdictResponse,
  DomainEntriesResponse,
  DomainsResponse,
  FocusStatusResponse,
  HealthResponse,
  RecentVerdictsResponse,
  RemoveDomainResponse,
} from '@focus/shared';

export type FocusApiClientOptions = {
  /** Racine du serveur, sans chemin. Ex. `http://localhost:5959`. */
  baseUrl: string;
  /** Abandon de la requête au-delà de ce délai. */
  timeoutMs?: number;
};

/** Erreur HTTP portant le code : l'appelant décide du message (400 / 404 / 409...). */
export class FocusApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'FocusApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 5000;

/** `/health` est à la racine ; tout le reste est sous ce préfixe. */
const FOCUS_PATH = '/api/v1/focus';

export function createFocusApiClient(options: FocusApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const focusUrl = `${baseUrl}${FOCUS_PATH}`;

  async function request<T>(url: string, init?: RequestInit, requestTimeoutMs = timeoutMs): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        throw new FocusApiError(res.status, `HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getHealth: (): Promise<HealthResponse> => request(`${baseUrl}/health`),

    getStatus: (): Promise<FocusStatusResponse> => request(`${focusUrl}/status`),

    /** Hostnames développés (www., m., alias) — ce que consomme le blocage navigateur. */
    getDomains: (): Promise<DomainsResponse> => request(`${focusUrl}/domains`),

    /** Entrées brutes de domains.json — ce que consomme l'affichage. */
    getDomainEntries: (): Promise<DomainEntriesResponse> => request(`${focusUrl}/domains/entries`),

    addDomain: (domain: string, category?: Category): Promise<AddDomainResponse> =>
      request(`${focusUrl}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, category } satisfies AddDomainRequest),
      }),

    /**
     * Corriger une erreur de l'IA. Le serveur refuse (403) tout ce qui n'est
     * pas un verdict `ollama` non-adulte : un blocage adulte ne se lève jamais
     * depuis le navigateur, et une entrée manuelle s'édite dans domains.json.
     */
    overrideDomain: (domain: string, category: Category): Promise<AddDomainResponse> =>
      request(`${focusUrl}/domains/${encodeURIComponent(domain)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      }),

    removeDomain: (domain: string): Promise<RemoveDomainResponse> =>
      request(`${focusUrl}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' }),

    /**
     * Classification d'un domaine inconnu. Une première classification peut
     * prendre ~20 s (chargement du modèle Ollama) : passer un `timeoutMs`
     * par appel supérieur au défaut du client.
     */
    classify: (url: string, opts?: { timeoutMs?: number }): Promise<ClassifyResponse> =>
      request(
        `${focusUrl}/classify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url } satisfies ClassifyRequest),
        },
        opts?.timeoutMs ?? timeoutMs,
      ),

    getRecentVerdicts: (limit?: number): Promise<RecentVerdictsResponse> =>
      request(`${focusUrl}/verdicts/recent${limit !== undefined ? `?limit=${encodeURIComponent(limit)}` : ''}`),

    deleteVerdict: (domain: string): Promise<DeleteVerdictResponse> =>
      request(`${focusUrl}/verdicts/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
  };
}

export type FocusApiClient = ReturnType<typeof createFocusApiClient>;
