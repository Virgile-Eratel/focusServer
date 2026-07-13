import type {
  AddDomainRequest,
  AddDomainResponse,
  DomainEntriesResponse,
  DomainsResponse,
  FocusStatusResponse,
  HealthResponse,
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

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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

    addDomain: (domain: string, tags?: string[]): Promise<AddDomainResponse> =>
      request(`${focusUrl}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, tags } satisfies AddDomainRequest),
      }),

    removeDomain: (domain: string): Promise<RemoveDomainResponse> =>
      request(`${focusUrl}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' }),
  };
}

export type FocusApiClient = ReturnType<typeof createFocusApiClient>;
