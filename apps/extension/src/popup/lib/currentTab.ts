/**
 * Hostname de l'onglet courant, prêt à être envoyé au serveur.
 *
 * On ne garde que l'hôte : `https://test.com/aa?x=1` → `test.com`. Le préfixe
 * `www.` est retiré car le serveur le ré-ajoute lui-même à l'expansion
 * (`includeWww` dans domains.json) — l'envoyer produirait `www.www.test.com`.
 *
 * Les sous-domaines réels sont conservés (`app.test.com` reste `app.test.com`) :
 * sans liste de suffixes publics, tronquer plus loin casserait `example.co.uk`.
 *
 * Retourne `null` sur les pages sans hôte exploitable (`chrome://`, `about:blank`,
 * fichiers locaux).
 */
export function normalizeHostname(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const hostname = url.hostname.replace(/^www\./, '');
  return hostname.length > 0 ? hostname : null;
}

/**
 * Le site que l'onglet actif VISE — pas l'URL qu'il affiche.
 *
 * Les deux diffèrent précisément là où ça compte : quand un site est bloqué,
 * l'onglet porte `chrome-extension://<id>/blocked.html?url=https://…`. Lire
 * `tab.url` y renvoyait donc « aucun site à classer », et le popup devenait
 * inutile à l'endroit exact où l'on en a besoin — corriger un site que l'IA a
 * bloqué à tort. Nos propres pages transportent la cible dans `?url=` : on la
 * reprend là.
 */
function targetOf(tabUrl: string): string | null {
  if (!tabUrl.startsWith(chrome.runtime.getURL(''))) return normalizeHostname(tabUrl);

  const target = new URL(tabUrl).searchParams.get('url');
  return target ? normalizeHostname(target) : null;
}

/** Domaine de l'onglet actif, ou `null` s'il n'est pas blocable. */
export async function getCurrentTabDomain(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return targetOf(tab.url);
  } catch {
    return null;
  }
}
