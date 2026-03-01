import type { DomainEntriesResponse, DomainEntryResponse } from '@focus/shared';

const API_BASE_URL = 'http://localhost:5959';
const API_FOCUS = `${API_BASE_URL}/api/v1/focus`;
const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// --- Status ---

async function checkHealth(): Promise<void> {
  const el = document.getElementById('server-status');
  if (!el) return;

  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/health`);
    if (res.ok) {
      el.textContent = 'OK';
      el.className = 'ok';
    } else {
      el.textContent = `Error (${res.status})`;
      el.className = 'error';
    }
  } catch {
    el.textContent = 'Unreachable';
    el.className = 'error';
  }
}

async function displayFocusStatus(): Promise<void> {
  const el = document.getElementById('focus-mode');
  if (!el) return;

  try {
    const res = await fetchWithTimeout(`${API_FOCUS}/status`);
    if (!res.ok) return;
    const data = await res.json();
    el.textContent = data.mode;
    el.className = data.mode;
  } catch {
    // Server unreachable
  }
}

// --- Domain list ---

function renderDomainList(entries: DomainEntryResponse[]): void {
  const listEl = document.getElementById('domain-list');
  const countEl = document.getElementById('domain-count');
  if (!listEl) return;
  if (countEl) countEl.textContent = String(entries.length);

  if (entries.length === 0) {
    listEl.innerHTML = '<div class="empty-list">No blocked domains</div>';
    return;
  }

  listEl.innerHTML = entries
    .map(
      (e) =>
        `<div class="domain-item">
          <span class="domain-name">${escapeHtml(e.domain)}</span>
          <button class="remove-btn" data-domain="${escapeAttr(e.domain)}" title="Remove">&times;</button>
        </div>`,
    )
    .join('');

  // Attach remove handlers (two-click: first shows confirm, second deletes)
  listEl.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const domain = el.dataset.domain;
      if (!domain) return;

      if (el.dataset.confirm === '1') {
        void handleRemoveDomain(domain);
      } else {
        el.dataset.confirm = '1';
        el.textContent = '?';
        el.classList.add('confirming');
        setTimeout(() => {
          el.dataset.confirm = '';
          el.innerHTML = '&times;';
          el.classList.remove('confirming');
        }, 3000);
      }
    });
  });
}

async function loadDomainEntries(): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${API_FOCUS}/domains/entries`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DomainEntriesResponse = await res.json();
    renderDomainList(data.entries);
  } catch {
    const listEl = document.getElementById('domain-list');
    if (listEl) listEl.innerHTML = '<div class="empty-list">Failed to load</div>';
  }
}

// --- Error/success messages ---

const ERROR_MESSAGES: Record<number, string> = {
  400: 'Domaine invalide — vérifiez le format.',
  404: 'Domaine introuvable dans la liste.',
  409: 'Ce domaine est déjà bloqué.',
};

function showError(msg: string): void {
  const el = document.getElementById('status-msg')!;
  el.textContent = msg;
  el.className = 'error';
  setTimeout(() => {
    el.textContent = '';
    el.className = '';
  }, 4000);
}

function showSuccess(msg: string): void {
  const el = document.getElementById('status-msg')!;
  el.textContent = msg;
  el.className = 'success';
  setTimeout(() => {
    el.textContent = '';
    el.className = '';
  }, 2000);
}

// --- Add/Remove domain ---

async function handleAddDomain(domain: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${API_FOCUS}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }), // tags omis en V1 — pas d'UI tags dans le popup
    });
    if (!res.ok) {
      showError(ERROR_MESSAGES[res.status] ?? `Erreur serveur (${res.status})`);
      return;
    }
    showSuccess(`${domain} ajouté`);
    await loadDomainEntries();
    chrome.runtime.sendMessage({ type: 'DOMAINS_UPDATED' });
  } catch {
    showError('Impossible de contacter le serveur.');
  }
}

async function handleRemoveDomain(domain: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${API_FOCUS}/domains/${encodeURIComponent(domain)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      showError(ERROR_MESSAGES[res.status] ?? `Erreur serveur (${res.status})`);
      return;
    }
    showSuccess(`${domain} supprimé`);
    await loadDomainEntries();
    chrome.runtime.sendMessage({ type: 'DOMAINS_UPDATED' });
  } catch {
    showError('Impossible de contacter le serveur.');
  }
}

async function getCurrentTabDomain(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).hostname;
  } catch {
    return null;
  }
}

// --- Helpers ---

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  void checkHealth();
  void displayFocusStatus();
  void loadDomainEntries();

  // Quick-add button: block current tab domain
  void getCurrentTabDomain().then((domain) => {
    const btn = document.getElementById('quick-add-btn') as HTMLButtonElement;
    if (!btn) return;
    if (domain) {
      btn.textContent = `+ Block ${domain}`;
      btn.disabled = false;
      btn.addEventListener('click', () => void handleAddDomain(domain));
    } else {
      btn.textContent = '+ Block current tab';
      btn.disabled = true;
    }
  });

  // Manual add
  const addBtn = document.getElementById('add-btn');
  const input = document.getElementById('domain-input') as HTMLInputElement;

  addBtn?.addEventListener('click', () => {
    const domain = input.value.trim();
    if (domain) {
      void handleAddDomain(domain);
      input.value = '';
    }
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const domain = input.value.trim();
      if (domain) {
        void handleAddDomain(domain);
        input.value = '';
      }
    }
  });
});
