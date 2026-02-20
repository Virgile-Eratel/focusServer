import type { DomainsResponse, FocusMode, FocusStatusResponse } from "@focus/shared";

const API_BASE = 'http://localhost:5959/api/v1/focus';
const ALARM_NAME = 'focus-status-poll';
const POLL_INTERVAL_MINUTES = 0.5; // 30 seconds

const STORAGE_KEY_PREV_MODE = 'previousMode';
const STORAGE_KEY_DOMAINS = 'cachedDomains';


// --- API calls ---

async function fetchStatus(): Promise<FocusStatusResponse> {
  const res = await fetch(`${API_BASE}/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchDomains(forceRefresh = false): Promise<string[]> {
  if (!forceRefresh) {
    const stored = await chrome.storage.local.get(STORAGE_KEY_DOMAINS);
    if (stored[STORAGE_KEY_DOMAINS]) return stored[STORAGE_KEY_DOMAINS] as string[];
  }

  const res = await fetch(`${API_BASE}/domains`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: DomainsResponse = await res.json();
  await chrome.storage.local.set({ [STORAGE_KEY_DOMAINS]: data.domains });
  return data.domains;
}

// --- declarativeNetRequest: blocage au niveau navigateur ---

const BLOCKING_RULE_ID = 1;

async function applyBlockingRules(domains: string[]): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCKING_RULE_ID],
    addRules: [{
      id: BLOCKING_RULE_ID,
      priority: 1,
      action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
      condition: { requestDomains: domains },
    }],
  });
}

async function clearBlockingRules(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [BLOCKING_RULE_ID],
  });
}

// --- Hard refresh (force reload des tabs existants) ---

function hardRefreshTab(tabId: number, tabUrl: string): Promise<chrome.tabs.Tab> {
  const url = new URL(tabUrl);
  url.searchParams.set('_focus_nocache', Date.now().toString());
  return chrome.tabs.update(tabId, { url: url.toString() });
}

// --- Domain matching ---

function isUrlBlocked(url: string, blockedDomains: string[]): boolean {
  try {
    const hostname = new URL(url).hostname;
    return blockedDomains.includes(hostname);
  } catch {
    return false;
  }
}

// --- Core polling logic ---

async function checkAndReload(): Promise<void> {
  try {
    const status = await fetchStatus();
    const stored = await chrome.storage.local.get(STORAGE_KEY_PREV_MODE);
    const previousMode: FocusMode | undefined = stored[STORAGE_KEY_PREV_MODE];

    const isTransitionToBlocked =
      previousMode === 'unblocked' && status.mode === 'blocked';

    await chrome.storage.local.set({ [STORAGE_KEY_PREV_MODE]: status.mode });

    // Sync des règles declarativeNetRequest avec le mode courant
    if (status.mode === 'blocked') {
      const domains = await fetchDomains(isTransitionToBlocked);
      await applyBlockingRules(domains);

      // Sur transition → blocked : forcer le reload des tabs déjà ouvertes
      if (isTransitionToBlocked) {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (tab.id && tab.url && isUrlBlocked(tab.url, domains)) {
            await hardRefreshTab(tab.id, tab.url);
          }
        }
      }
    } else {
      await clearBlockingRules();
    }
  } catch (error) {
    console.warn('[FocusServer] Poll error:', error);
  }
}

// --- Tab switch: reload if user comes back to a blocked site while blocked ---

async function onTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY_PREV_MODE);
    if (stored[STORAGE_KEY_PREV_MODE] !== 'blocked') return;

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

chrome.tabs.onActivated.addListener((activeInfo) => {
  void onTabActivated(activeInfo);
});

// --- Alarm setup ---

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void checkAndReload();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
  });
  void initializeMode();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: POLL_INTERVAL_MINUTES,
  });
});

async function initializeMode(): Promise<void> {
  try {
    const status = await fetchStatus();
    await chrome.storage.local.set({ [STORAGE_KEY_PREV_MODE]: status.mode });

    if (status.mode === 'blocked') {
      const domains = await fetchDomains(true);
      await applyBlockingRules(domains);
    } else {
      await clearBlockingRules();
    }
  } catch {
    // Server not available yet — first successful poll will seed the mode
  }
}
