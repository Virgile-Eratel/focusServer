import type { DomainsResponse, FocusStatusResponse } from '@focus/shared';

const API_BASE = 'http://localhost:5959/api/v1/focus';
const ALARM_NAME = 'focus-status-poll';
const POLL_INTERVAL_MINUTES = 0.5; // 30 secondes

/** Identifiant de l'unique règle de blocage posée dans Chrome. */
const BLOCKING_RULE_ID = 1;

// --- Appels serveur (aucun cache : le serveur fait autorité) ---

const FETCH_TIMEOUT_MS = 5000;

function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function fetchStatus(): Promise<FocusStatusResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchDomains(): Promise<string[]> {
  const res = await fetchWithTimeout(`${API_BASE}/domains`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: DomainsResponse = await res.json();
  return data.domains;
}

// --- declarativeNetRequest : blocage au niveau navigateur ---

/**
 * L'état « le blocage est-il actif ? » est lu depuis les règles réellement
 * posées dans Chrome, et non mémorisé quelque part. Le service worker MV3 est
 * tué en permanence : toute mémoire locale serait de toute façon perdue, et un
 * état stocké finirait par diverger de la réalité.
 */
async function isBlockingActive(): Promise<boolean> {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.some((rule) => rule.id === BLOCKING_RULE_ID);
}

async function applyBlockingRules(domains: string[]): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCKING_RULE_ID],
    addRules: [
      {
        id: BLOCKING_RULE_ID,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { requestDomains: domains },
      },
    ],
  });
}

async function clearBlockingRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCKING_RULE_ID],
  });
}

// --- Rechargement forcé des onglets déjà ouverts ---

function hardRefreshTab(tabId: number, tabUrl: string): Promise<chrome.tabs.Tab> {
  const url = new URL(tabUrl);
  url.searchParams.set('_focus_nocache', Date.now().toString());
  return chrome.tabs.update(tabId, { url: url.toString() });
}

function isUrlBlocked(url: string, blockedDomains: string[]): boolean {
  try {
    return blockedDomains.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function hardRefreshBlockedTabs(domains: string[]): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url && isUrlBlocked(tab.url, domains)) {
      await hardRefreshTab(tab.id, tab.url);
    }
  }
}

// --- Boucle de synchronisation ---

/**
 * Aligne les règles du navigateur sur le mode du serveur.
 * Le passage unblocked → blocked se déduit de l'absence de règles : on force
 * alors le rechargement des onglets déjà ouverts, qui sinon resteraient
 * affichés depuis le cache du navigateur.
 */
async function syncWithServer(): Promise<void> {
  try {
    const status = await fetchStatus();

    if (status.mode !== 'blocked') {
      await clearBlockingRules();
      return;
    }

    const wasBlocking = await isBlockingActive();
    const domains = await fetchDomains();
    await applyBlockingRules(domains);

    if (!wasBlocking) {
      await hardRefreshBlockedTabs(domains);
    }
  } catch (error) {
    console.warn('[FocusServer] Sync error:', error);
  }
}

/** Retour sur un onglet bloqué pendant le blocage → recharger (il peut venir du cache). */
async function onTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  try {
    if (!(await isBlockingActive())) return;

    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;

    const domains = await fetchDomains();
    if (isUrlBlocked(tab.url, domains)) {
      await hardRefreshTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.warn('[FocusServer] Tab activation check error:', error);
  }
}

// --- Événements ---

chrome.tabs.onActivated.addListener((activeInfo) => {
  void onTabActivated(activeInfo);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void syncWithServer();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  void syncWithServer();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  void syncWithServer();
});

// Le popup notifie après un ajout/suppression de domaine.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DOMAINS_UPDATED') {
    syncWithServer()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // réponse asynchrone
  }
});
