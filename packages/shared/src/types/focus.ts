import { FocusMode } from './focusMode';
import { Category } from './category';

export type ApplicableFocusMode = Exclude<FocusMode, 'unknown'>;
export type RuntimeFocusMode = FocusMode;

/** Prochain basculement du mode, déduit du planning. `at` est une date ISO 8601. */
export type ScheduledTransition = {
  mode: ApplicableFocusMode;
  at: string;
};

/** État courant d'une catégorie. Seule `entertainment` porte une transition. */
export type CategoryState = {
  category: Category;
  /** La catégorie est-elle bloquée en ce moment ? */
  blocked: boolean;
  /** Prochaine bascule de CETTE catégorie. adult/other : toujours `null` (état constant). */
  nextTransition: ScheduledTransition | null;
};

export type FocusStatus = {
  mode: FocusMode;
  isScheduledPause: boolean;
  time: string;
  /** `null` quand le planning ne change jamais d'état. */
  nextTransition: ScheduledTransition | null;
  /** Les 3 catégories, ordre fixe : adult, entertainment, other. */
  categories: CategoryState[];
  /**
   * Hostnames expansés actuellement bloqués (politique + planning, calculés
   * côté serveur). L'extension pose ses règles DNR depuis cette liste sans
   * connaître la politique.
   */
  blockedDomains: string[];
};
