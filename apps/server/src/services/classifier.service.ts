import type { DomainSource, VerdictCategory } from '@focus/shared';
import { getRegistrableDomain } from '../utils/registrableDomain';
import { httpError } from '../utils/httpError';
import { isBlockableCategory, isVerdictBlocked } from '../config/categories';
import { isScheduledPause } from './scheduleService';
import { addDomain, findEntryByRegistrableDomain } from './domain.service';
import { deleteVerdict, getVerdict, listUnknownVerdicts, saveVerdict } from './verdict.service';
import { classifyDomainByKnowledge, classifyWithEvidence, screenDomainName } from './ollama.service';
import { fetchPageEvidence, saysMoreThanItsName } from './pageFetcher.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('classifier');

/**
 * Orchestration de la classification (spec §7) :
 *   domains.json → verdicts.db → Ollama (domaine seul → page si hésitation).
 *
 * Sens des dépendances (spec §7.3) : ce module importe domain.service, jamais
 * l'inverse — domain.service importe déjà focus.service, la flèche retour
 * fermerait un cycle. Seul le contrôleur importe ce module.
 *
 * Invariant §3.3 : un verdict ne peut QU'AJOUTER un blocage. Aucune sortie de
 * modèle ne retire quoi que ce soit de domains.json, /etc/hosts ou PF.
 */

export type ClassifyOutcome = {
  domain: string;
  category: VerdictCategory;
  blocked: boolean;
  source: DomainSource;
};

/**
 * Le verdict, et l'évidence qui l'a produit.
 *
 * ⚠️ Politique (§3.5, révisée) : **bloquer, c'est savoir.** Tout ce qui n'est
 * pas su — Ollama éteint, page illisible ET nom inconnu, réponse invalide —
 * devient `unknown`, et `unknown` NE BLOQUE PAS. L'inverse (l'ancien « fail
 * closed ») bloquait des outils de travail sur une ignorance : le modèle,
 * sommé de choisir sans rien savoir, répondait « divertissement ».
 *
 * Trois chemins, du plus sûr au plus fragile :
 *   - le nom contient du vocabulaire porno → adult, sans charger la page
 *     (on ne va pas chercher une page porno pour se le confirmer, §3.4) ;
 *   - la page PARLE (elle dit plus que sa marque) → c'est elle qui tranche.
 *     C'est le chemin normal ;
 *   - la page est illisible ou muette (« Tiime ») → il ne reste que ce que le
 *     modèle croit savoir : plusieurs tirages, et l'accord seul fait foi
 *     (cf. `classifyDomainByKnowledge`). Sinon `unknown` ⇒ non bloqué.
 */
async function classifyWithOllama(
  domain: string,
  originalUrl: string,
): Promise<{ category: VerdictCategory; evidence: string | null }> {
  const screen = await screenDomainName(domain);
  if (!screen.ok) {
    return { category: 'unknown', evidence: `screen: ${screen.reason}` };
  }
  if (screen.explicitAdult) {
    return { category: 'adult', evidence: 'explicit adult wording in domain name' };
  }

  // Le serveur va chercher le titre/métas — jamais le navigateur (spec §3.4).
  const evidence = await fetchPageEvidence(originalUrl);

  if (!saysMoreThanItsName(domain, evidence)) {
    const byKnowledge = await classifyDomainByKnowledge(domain);
    if (!byKnowledge.ok) {
      return { category: 'unknown', evidence: `page silent; knowledge: ${byKnowledge.reason}` };
    }
    if (byKnowledge.category === 'unsure') {
      return { category: 'unknown', evidence: 'page silent; domain name not reliably known' };
    }
    return { category: byKnowledge.category, evidence: 'page silent; domain name consistently known' };
  }

  const byEvidence = await classifyWithEvidence(domain, evidence);
  if (!byEvidence.ok) {
    return { category: 'unknown', evidence: `evidence step: ${byEvidence.reason}` };
  }
  return { category: byEvidence.category as VerdictCategory, evidence: JSON.stringify(evidence) };
}

/**
 * Persiste le verdict puis, si la catégorie est blocable, l'ajoute à
 * domains.json — la régénération force l'application immédiate (même en
 * pause : les fichiers unblocked portent les adult). `other`/`unknown` ne
 * polluent pas la blocklist.
 */
async function persistVerdict(domain: string, category: VerdictCategory, evidence: string | null): Promise<void> {
  saveVerdict({ domain, category, source: 'ollama', decidedAt: new Date().toISOString(), evidence });
  log.info({ domain, category }, 'Domain classified');

  if (category === 'unknown' || !isBlockableCategory(category)) return;

  try {
    await addDomain(domain, category, 'ollama');
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    if (e.statusCode === 409) {
      // Course perdue contre un ajout manuel : le blocage est déjà en place.
    } else {
      // Le verdict existe ; la boucle de synchro retentera les fichiers.
      log.error({ err: e, domain }, 'Failed to add classified domain to blocklist');
    }
  }
}

async function classifyDomain(domain: string, originalUrl: string): Promise<ClassifyOutcome> {
  // 1. domains.json fait autorité : un domaine listé (ou alias) ne repasse
  //    jamais devant Ollama, et aucun verdict n'est écrit pour lui.
  const entry = findEntryByRegistrableDomain(domain);
  if (entry) {
    return {
      domain,
      category: entry.category,
      blocked: isVerdictBlocked(entry.category, isScheduledPause()),
      source: entry.source,
    };
  }

  // 2. Verdict déjà rendu — le chemin chaud (< 5 ms).
  const verdict = getVerdict(domain);
  if (verdict) {
    return {
      domain,
      category: verdict.category,
      blocked: isVerdictBlocked(verdict.category, isScheduledPause()),
      source: verdict.source,
    };
  }

  // 3. Première visite : Ollama décide, le verdict est persisté — y compris
  //    `unknown` (non bloquant, re-tenté au démarrage ou via DELETE).
  const { category, evidence } = await classifyWithOllama(domain, originalUrl);
  await persistVerdict(domain, category, evidence);

  return {
    domain,
    category,
    blocked: isVerdictBlocked(category, isScheduledPause()),
    source: 'ollama',
  };
}

/**
 * Coalescence des appels concurrents (plusieurs onglets ouvrant le même
 * domaine inconnu) : une seule classification en vol par domaine. Ce n'est
 * pas un cache — rien ne survit à la résolution de la promesse.
 */
const inflight = new Map<string, Promise<ClassifyOutcome>>();

export async function classifyUrl(rawUrl: string): Promise<ClassifyOutcome> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError('Invalid URL', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw httpError('Unsupported URL scheme', 400);
  }

  const domain = getRegistrableDomain(url.hostname);
  if (!domain) {
    throw httpError('URL has no registrable domain', 400);
  }

  const pending = inflight.get(domain);
  if (pending) return pending;

  const promise = classifyDomain(domain, rawUrl).finally(() => inflight.delete(domain));
  inflight.set(domain, promise);
  return promise;
}

/**
 * Re-tente les verdicts `unknown` — souvent le signe qu'Ollama était éteint
 * (spec §9.3). Appelé au démarrage, en série : Ollama est local, inutile de
 * le marteler.
 */
export async function retryUnknownVerdicts(): Promise<void> {
  const unknowns = listUnknownVerdicts();
  if (!unknowns.length) return;

  log.info({ count: unknowns.length }, 'Retrying unknown verdicts');
  let resolved = 0;
  for (const row of unknowns) {
    // Entre-temps, un humain a pu lister le domaine : domains.json fait
    // autorité, le verdict `unknown` est obsolète — on l'efface sans classer.
    if (findEntryByRegistrableDomain(row.domain)) {
      deleteVerdict(row.domain);
      resolved++;
      continue;
    }

    const { category, evidence } = await classifyWithOllama(row.domain, `https://${row.domain}/`);
    if (category === 'unknown') continue; // toujours indécis — on garde le verdict existant

    await persistVerdict(row.domain, category, evidence);
    resolved++;
  }
  log.info({ resolved, remaining: unknowns.length - resolved }, 'Unknown verdicts retry done');
}
