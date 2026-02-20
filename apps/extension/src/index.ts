
const API_BASE_URL = 'http://localhost:5959';
const API_FOCUS = `${API_BASE_URL}/api/v1/focus`;

async function checkHealth(): Promise<void> {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  try {
    const res = await fetch(`${API_BASE_URL}/health`);

    if (res.ok) {
      const data = (await res.json()) as { message: string };
      statusEl.textContent = `Server OK - ${data.message}`;
      statusEl.className = 'ok';
    } else {
      statusEl.textContent = `Server error (HTTP ${res.status})`;
      statusEl.className = 'error';
    }
  } catch {
    statusEl.textContent = 'Server unreachable';
    statusEl.className = 'error';
  }
}

async function displayFocusStatus(): Promise<void> {
  const modeEl = document.getElementById('focus-mode');
  if (!modeEl) return;

  const status = await fetch(`${API_FOCUS}/status`);
  if (!status.ok) return;
  const data = await status.json();
  modeEl.textContent = data.mode;
  modeEl.className = data.mode;
}

document.addEventListener('DOMContentLoaded', () => {
  void checkHealth();
  void displayFocusStatus();
});
