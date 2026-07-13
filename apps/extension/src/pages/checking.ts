import type { VerdictCategory } from '@focus/shared';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { CATEGORY_LABELS } from '../lib/categoryLabels';
import { parseTargetUrl } from '../lib/navigation';

/**
 * L'écran de vérification : l'onglet est détourné ici AVANT que le site ne
 * charge. La page interroge le serveur (`POST /classify`), puis :
 *   - domaine autorisé  → retour vers l'URL d'origine (le service worker
 *     laisse passer : l'onglet porte encore checking.html?url=<cible>) ;
 *   - domaine bloqué    → écran terminal, AUCUN bouton de déblocage (§3.3) ;
 *   - serveur muet      → on laisse passer (§3.5 révisée : bloquer, c'est
 *     savoir). Un daemon arrêté ne doit pas murer tout le web inconnu — et il
 *     ne débloque rien : les domaines déjà listés restent bloqués par les
 *     règles DNR posées, par /etc/hosts et par PF, qu'il tourne ou non.
 */

/** Ollama froid peut prendre ~20 s : plus large que le timeout serveur. */
const CLASSIFY_TIMEOUT_MS = 25_000;

const root = document.getElementById('root')!;

function renderChecking(hostname: string): void {
  root.replaceChildren();
  const spinner = el('div', 'spinner');
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', 'Checking');
  root.append(spinner, el('h1', null, 'Checking…'), el('p', 'domain', hostname));
}

function renderBlocked(hostname: string, category: VerdictCategory): void {
  document.title = 'Blocked';
  const badges = el('p', null);
  badges.append(
    el('span', 'badge blocked', 'Blocked'),
    el('span', 'badge category', CATEGORY_LABELS[category] ?? category),
  );
  root.replaceChildren(el('h1', 'domain', hostname), badges);
}

function renderInvalid(): void {
  root.replaceChildren(el('h1', null, 'Invalid URL'), el('p', null, 'This page cannot be visited directly.'));
}

async function run(): Promise<void> {
  const target = parseTargetUrl(new URLSearchParams(location.search).get('url'));
  if (!target) {
    renderInvalid();
    return;
  }

  renderChecking(target.hostname);

  try {
    const verdict = await api.classify(target.toString(), { timeoutMs: CLASSIFY_TIMEOUT_MS });

    if (!verdict.blocked) {
      // `replace` : l'écran de vérification ne pollue pas l'historique.
      location.replace(target.toString());
      return;
    }

    renderBlocked(target.hostname, verdict.category);
    // Pose la règle DNR tout de suite (sinon prochain poll ≤ 30 s).
    void chrome.runtime.sendMessage({ type: 'DOMAINS_UPDATED' }).catch(() => {});
  } catch {
    // Serveur injoignable : on n'a rien su de ce domaine, donc on ne le bloque
    // pas. Le serveur éteint refuse la connexion tout de suite — la traversée
    // est immédiate, elle n'inflige pas 25 s d'attente à chaque navigation.
    location.replace(target.toString());
  }
}

void run();
