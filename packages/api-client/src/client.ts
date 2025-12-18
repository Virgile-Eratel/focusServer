import type {
  FocusStatus,
  HealthResponse,
  PauseResult,
  ResumeResponse,
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

  async function pause(durationMinutes?: number): Promise<PauseResult> {
    const res = await fetch(`${baseUrl}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMinutes }),
    });
    // 429 = pause_limit_reached → still valid JSON, don't throw
    return res.json();
  }

  async function resume(): Promise<ResumeResponse> {
    const res = await fetch(`${baseUrl}/resume`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  return { getHealth, getStatus, pause, resume };
}

export type FocusApiClient = ReturnType<typeof createFocusApiClient>;

