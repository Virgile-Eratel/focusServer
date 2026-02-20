import type {
  FocusStatus,
  HealthResponse,
  DomainsResponse,
} from '@focus/shared';

export type FocusApiClientOptions = {
  baseUrl: string;
};

export function createFocusApiClient(options: FocusApiClientOptions) {
  const { baseUrl } = options;

  async function getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function getStatus(): Promise<FocusStatus> {
    const res = await fetch(`${baseUrl}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function getDomains(): Promise<DomainsResponse> {
    const res = await fetch(`${baseUrl}/domains`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return { getHealth, getStatus, getDomains };
}

export type FocusApiClient = ReturnType<typeof createFocusApiClient>;

