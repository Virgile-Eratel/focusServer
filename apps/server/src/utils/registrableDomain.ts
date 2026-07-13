import { getDomain } from 'tldts';
import { normalizeHostname } from './hostname';

/**
 * Domaine enregistrable (eTLD+1) — la clé des verdicts (spec §3.9).
 *
 * `fr.xhamsterlive.com` et `xhamsterlive.com` doivent partager UN verdict,
 * sinon créer un sous-domaine suffit à repartir à zéro face au classifieur.
 * `tldts` porte la liste des suffixes publics : `example.co.uk` reste
 * `example.co.uk`, il ne devient pas `co.uk`.
 *
 * Accepte un hostname ou une URL complète. Retourne `null` pour une IP,
 * `localhost`, un suffixe public seul ou une entrée invalide.
 */
export function getRegistrableDomain(input: string): string | null {
  const host = normalizeHostname(input);
  if (!host) return null;
  return getDomain(host);
}
