const API_BASE_URL = 'http://localhost:5959';

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

document.addEventListener('DOMContentLoaded', () => {
  void checkHealth();
});
