import type { Category } from '@focus/shared';
import { api } from '../lib/api';
import { el } from '../lib/dom';
import { CATEGORY_LABELS } from '../lib/categoryLabels';
import { hostMatches, parseTargetUrl } from '../lib/navigation';

/**
 * L'écran de blocage pour un domaine déjà connu (règle DNR posée). Texte
 * seul : l'URL, « Bloqué », la catégorie. Aucun bouton de déblocage (§3.3).
 *
 * La catégorie vient de la liste des entrées (lecture pure) — surtout pas de
 * `POST /classify`, qui peut classifier et ÉCRIRE : une page d'affichage ne
 * doit déclencher ni Ollama ni un ajout à la blocklist.
 */

const root = document.getElementById('root')!;

function render(hostname: string, category: Category | null): void {
  const badges = el('p', null);
  badges.append(el('span', 'badge blocked', 'Blocked'));
  if (category) {
    badges.append(el('span', 'badge category', CATEGORY_LABELS[category] ?? category));
  }
  root.replaceChildren(el('h1', null, hostname), badges);
}

async function run(): Promise<void> {
  const target = parseTargetUrl(new URLSearchParams(location.search).get('url'));
  if (!target) {
    root.replaceChildren(el('h1', null, 'Blocked'));
    return;
  }

  render(target.hostname, null);

  try {
    const { entries } = await api.getDomainEntries();
    const entry = entries.find((e) => hostMatches(target.hostname, e.domain));
    if (entry) render(target.hostname, entry.category);
  } catch {
    // Le serveur ne répond pas : l'écran reste « Blocked » sans catégorie.
  }
}

void run();
