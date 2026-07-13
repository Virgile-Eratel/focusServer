/**
 * Prédicats purs de l'interception de navigation — séparés de background.ts
 * pour être testables sans exécuter les listeners du service worker.
 */

/** `requestDomains` (DNR) matche aussi les sous-domaines : cette fonction fait pareil. */
export function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * Les deux hôtes appartiennent-ils au même site (égalité ou sous-domaine dans
 * un sens ou l'autre) ? Une navigation interne à un site déjà affiché n'est
 * pas re-vérifiée : le site a été contrôlé à l'arrivée, et re-détourner chaque
 * clic casserait les formulaires POST (rejoués en GET par checking.html).
 * Les domaines bloqués ne passent pas par ici — la règle DNR est testée avant.
 */
export function isSameSite(hostA: string, hostB: string): boolean {
  return hostMatches(hostA, hostB) || hostMatches(hostB, hostA);
}

/**
 * Hôtes jamais interceptés : la machine locale, les IP littérales et les noms
 * sans point (intranet, routeur, NAS…). Ils n'ont pas de domaine enregistrable
 * — le serveur ne peut pas les classer (400) — et la blocklist ne vise que le
 * web public par nom de domaine. Sans cette exemption, tout le réseau local
 * serait bloqué en permanence (fail closed sans issue).
 */
export function isExemptHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return true;
  }
  if (!hostname.includes('.')) return true; // nom simple (intranet)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true; // IPv4 littérale
  if (hostname.includes(':') || hostname.startsWith('[')) return true; // IPv6 littérale
  return false;
}

/**
 * Anti-boucle sans stockage : pendant `onBeforeNavigate`, la navigation n'est
 * pas encore committée — `tab.url` est ENCORE la page précédente. Si l'onglet
 * est notre checking.html portant exactement cette URL cible, c'est que
 * checking.html vient de rendre son verdict « safe » et redirige : on laisse
 * passer une fois.
 */
export function isOwnCheckingPageFor(tabUrl: string | undefined, targetUrl: string, checkingBaseUrl: string): boolean {
  if (!tabUrl || !tabUrl.startsWith(checkingBaseUrl)) return false;
  try {
    return new URL(tabUrl).searchParams.get('url') === targetUrl;
  } catch {
    return false;
  }
}

/** Seules les cibles http/https sont légitimes dans `?url=` (anti `javascript:`). */
export function parseTargetUrl(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
