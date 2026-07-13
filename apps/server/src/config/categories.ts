import type { Category, CategoryState, ScheduledTransition, VerdictCategory } from '@focus/shared';
import { CATEGORIES } from '@focus/shared';

/**
 * LA politique de blocage par catégorie (spec §3.1) — encodée UNE fois, dans
 * `isCategoryBlocked`. Tout le reste (fichiers générés, /status, verdicts,
 * blocklist) en dérive : une nouvelle catégorie s'ajoute ici et nulle part
 * ailleurs.
 *
 *   adult          → bloqué TOUJOURS. Aucune pause, aucune exception.
 *   entertainment  → bloqué selon WEEKLY_SCHEDULE (libre pendant les pauses).
 *   other          → jamais bloqué.
 *
 * Règle : n'ajouter une catégorie que si elle porte une NOUVELLE politique,
 * pas pour mieux décrire le web.
 */

/** La catégorie est-elle bloquée en ce moment ? */
export function isCategoryBlocked(category: Category, isPause: boolean): boolean {
  switch (category) {
    case 'adult':
      return true;
    case 'entertainment':
      return !isPause;
    case 'other':
      return false;
  }
}

/**
 * Idem pour la catégorie d'un verdict. `unknown` = « on n'a pas su » :
 * **NON bloqué** (spec §3.5, révisée). Seul point du code où cette règle vit.
 *
 * Pourquoi l'inverse de l'intuition — et de la première version. Bloquer par
 * défaut suppose qu'un doute soit rare ; il ne l'est pas. Sont `unknown` :
 * Ollama éteint, une page en 403, une page qui ne dit que sa marque, un nom
 * que le modèle ne connaît pas. Sommé de trancher sans rien savoir, le modèle
 * ne s'abstenait pas : il devinait « divertissement ». Résultat vécu :
 * `tiime.fr` (compta), `ancv.com` (chèques-vacances) bloqués comme des
 * distractions. Le coût du doute retombait entièrement sur le travail.
 *
 * Donc : **bloquer, c'est savoir.** Un site n'est bloqué que sur une preuve —
 * du vocabulaire porno dans le nom, une page qui parle d'elle-même, ou une
 * marque que le modèle décrit de la même façon à chaque tirage. Le reste
 * passe, et l'humain l'ajoute à la main s'il le veut : c'est lui qui décide de
 * bloquer, jamais l'ignorance de la machine.
 */
export function isVerdictBlocked(category: VerdictCategory, isPause: boolean): boolean {
  if (category === 'unknown') return false;
  return isCategoryBlocked(category, isPause);
}

/**
 * Une catégorie « blocable » entre dans domains.json (et donc dans les
 * fichiers système) : c'est une catégorie bloquée au moins en mode focus.
 */
export function isBlockableCategory(category: Category): boolean {
  return isCategoryBlocked(category, false);
}

/** Les catégories bloquées pendant (ou hors) pause — dérivées de la politique. */
export function categoriesBlockedDuring(isPause: boolean): Category[] {
  return CATEGORIES.filter((category) => isCategoryBlocked(category, isPause));
}

/** Catégories présentes dans hosts.blocked / pf.user.conf.template (mode focus). */
export const BLOCKED_FILE_CATEGORIES: readonly Category[] = categoriesBlockedDuring(false);

/** Catégories présentes dans hosts.unblocked / pf.unblocked.conf.template (mode pause). */
export const UNBLOCKED_FILE_CATEGORIES: readonly Category[] = categoriesBlockedDuring(true);

/**
 * L'état des 3 catégories pour `/status`, dans l'ordre de `CATEGORIES`.
 * Une transition n'est portée que par une catégorie dont l'état dépend du
 * planning (bloquée en focus, libre en pause).
 */
export function getCategoryStates(isPause: boolean, nextTransition: ScheduledTransition | null): CategoryState[] {
  return CATEGORIES.map((category) => {
    const changesWithSchedule = isCategoryBlocked(category, false) !== isCategoryBlocked(category, true);
    return {
      category,
      blocked: isCategoryBlocked(category, isPause),
      nextTransition: changesWithSchedule ? nextTransition : null,
    };
  });
}
