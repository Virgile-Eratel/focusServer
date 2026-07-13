import { api } from './lib/api';
import { hostMatches, isExemptHost, isOwnCheckingPageFor, isSameSite } from './lib/navigation';

const ALARM_NAME = 'focus-status-poll';
const POLL_INTERVAL_MINUTES = 0.5; // 30 secondes

/** Identifiant de l'unique règle de blocage posée dans Chrome. */
const BLOCKING_RULE_ID = 1;

/** Pages de l'extension (chemins depuis la racine du dossier chargé). */
const CHECKING_PAGE = 'dist/checking.html';
const BLOCKED_PAGE = 'dist/blocked.html';

// --- declarativeNetRequest : blocage au niveau navigateur ---

/**
 * L'état « quels domaines sont bloqués ? » est lu depuis les règles réellement
 * posées dans Chrome, et non mémorisé quelque part. Le service worker MV3 est
 * tué en permanence : toute mémoire locale serait de toute façon perdue, et un
 * état stocké finirait par diverger de la réalité.
 */
async function getRuleDomains(): Promise<string[]> {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const rule = rules.find((r) => r.id === BLOCKING_RULE_ID);
  return rule?.condition.requestDomains ?? [];
}

async function applyBlockingRules(domains: string[]): Promise<void> {
  if (domains.length === 0) {
    // `requestDomains: []` est rejeté par Chrome : on retire simplement la règle.
    await clearBlockingRules();
    return;
  }
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

// --- Correspondance hostname / domaine bloqué ---

function isUrlBlocked(url: string, blockedDomains: string[]): boolean {
  try {
    const { hostname } = new URL(url);
    return blockedDomains.some((domain) => hostMatches(hostname, domain));
  } catch {
    return false;
  }
}

// --- Rechargement forcé des onglets déjà ouverts ---

function hardRefreshTab(tabId: number, tabUrl: string): Promise<chrome.tabs.Tab> {
  const url = new URL(tabUrl);
  url.searchParams.set('_focus_nocache', Date.now().toString());
  return chrome.tabs.update(tabId, { url: url.toString() });
}

async function hardRefreshBlockedTabs(domains: string[]): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id && tab.url && isUrlBlocked(tab.url, domains))
      .map((tab) => hardRefreshTab(tab.id!, tab.url!)),
  );
}

// --- Boucle de synchronisation ---

/**
 * Aligne les règles du navigateur sur `status.blockedDomains` : la liste des
 * hostnames bloqués EN CE MOMENT, calculée côté serveur (politique par
 * catégorie + planning). En pause, elle contient encore les domaines adult —
 * l'extension ne connaît pas la politique, elle pose ce qu'on lui donne.
 *
 * Les domaines nouvellement bloqués (bascule pause → focus, classification
 * fraîche) sont détectés par différence avec les règles lues AVANT la mise à
 * jour — sans état stocké — et leurs onglets ouverts sont rechargés de force,
 * sinon ils resteraient affichés depuis le cache du navigateur.
 */
async function syncWithServer(): Promise<void> {
  try {
    const status = await api.getStatus();
    // Garde de version : un vieux serveur (avant les catégories) ne renvoie
    // pas blockedDomains — on retire les règles plutôt que de crasher chaque
    // poll et de geler l'état (hosts/PF restent la défense de fond).
    const domains = Array.isArray(status.blockedDomains) ? status.blockedDomains : [];

    const previous = await getRuleDomains();
    await applyBlockingRules(domains);

    const added = domains.filter((domain) => !previous.includes(domain));
    if (added.length > 0) {
      await hardRefreshBlockedTabs(added);
    }
  } catch (error) {
    console.warn('[FocusServer] Sync error:', error);
  }
}

/** Retour sur un onglet bloqué pendant le blocage → recharger (il peut venir du cache). */
async function onTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  try {
    const domains = await getRuleDomains();
    if (domains.length === 0) return;

    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;

    if (isUrlBlocked(tab.url, domains)) {
      await hardRefreshTab(activeInfo.tabId, tab.url);
    }
  } catch (error) {
    console.warn('[FocusServer] Tab activation check error:', error);
  }
}

// --- Interception des navigations (webNavigation) ---

function extensionPageUrl(page: string, targetUrl: string): string {
  return `${chrome.runtime.getURL(page)}?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * Toute navigation principale vers un site que l'extension ne connaît pas
 * détourne l'onglet vers checking.html AVANT que le site ne charge : c'est le
 * serveur qui ira lire la page, jamais le navigateur (spec §3.4). Un domaine
 * déjà bloqué (règle DNR) reçoit l'écran de blocage — la requête réseau, elle,
 * est de toute façon tuée par DNR. Une navigation interne au site déjà affiché
 * passe sans détour (contrôlé à l'arrivée ; re-détourner casserait les POST).
 */
async function onBeforeNavigate(details: chrome.webNavigation.WebNavigationParentedCallbackDetails): Promise<void> {
  if (details.frameId !== 0) return; // main frame uniquement

  let url: URL;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }
  if (isExemptHost(url.hostname)) return;

  // tabs.get peut échouer (prérendu, onglet fermé) : on continue alors le
  // flot de vérification — jamais de laisser-passer sur erreur (fail closed).
  const [ruleDomains, tab] = await Promise.all([getRuleDomains(), chrome.tabs.get(details.tabId).catch(() => null)]);

  if (ruleDomains.some((domain) => hostMatches(url.hostname, domain))) {
    // L'ordre compte : ce test passe AVANT les exemptions, pour qu'une URL
    // re-tapée depuis l'écran de vérification (ou un clic interne sur un site
    // fraîchement bloqué) reste bloquée.
    void chrome.tabs.update(details.tabId, { url: extensionPageUrl(BLOCKED_PAGE, details.url) });
    return;
  }

  if (isOwnCheckingPageFor(tab?.url, details.url, chrome.runtime.getURL(CHECKING_PAGE))) return;

  // Navigation interne au site affiché : déjà contrôlée à l'arrivée.
  if (tab?.url) {
    try {
      const current = new URL(tab.url);
      if (
        (current.protocol === 'http:' || current.protocol === 'https:') &&
        isSameSite(current.hostname, url.hostname)
      ) {
        return;
      }
    } catch {
      /* tab.url illisible → vérification normale */
    }
  }

  void chrome.tabs.update(details.tabId, { url: extensionPageUrl(CHECKING_PAGE, details.url) });
}

// --- Événements ---

chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
    void onBeforeNavigate(details).catch((error) => {
      console.warn('[FocusServer] Navigation check error:', error);
    });
  },
  // Les pages de l'extension (chrome-extension://) ne matchent pas ces schémas.
  { url: [{ schemes: ['http', 'https'] }] },
);

chrome.tabs.onActivated.addListener((activeInfo) => {
  void onTabActivated(activeInfo);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void syncWithServer();
  }
});

function init(): void {
  void chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_INTERVAL_MINUTES });
  void syncWithServer();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

/**
 * `"incognito": "split"` (manifest) donne à la fenêtre privée SON PROPRE
 * service worker — et celui-là ne reçoit ni `onInstalled` ni `onStartup` : ces
 * deux événements appartiennent au profil normal. Sans ce réveil, le worker
 * privé n'armerait jamais son alarme et ne poserait jamais ses règles : la
 * navigation privée deviendrait le trou dans la raquette.
 *
 * `alarms.get` d'abord : réarmer l'alarme à chaque réveil du worker (MV3 le tue
 * en permanence) repousserait le prochain tir de 30 s à l'infini.
 */
void chrome.alarms.get(ALARM_NAME).then((alarm) => {
  if (!alarm) init();
});

// Le popup et checking.html notifient après un changement de blocklist :
// on repose les règles tout de suite plutôt que d'attendre le poll (≤ 30 s).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DOMAINS_UPDATED') {
    syncWithServer()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // réponse asynchrone
  }
});
