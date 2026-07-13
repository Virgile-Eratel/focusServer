import http from 'http';
import https from 'https';
import dns from 'dns';
import net from 'net';
import type { LookupFunction } from 'net';
import {
  EVIDENCE_MAX_CHARS,
  MIN_PAGE_SIGNAL_CHARS,
  PAGE_FETCH_MAX_BYTES,
  PAGE_FETCH_MAX_REDIRECTS,
  PAGE_FETCH_TIMEOUT_MS,
} from '../utils/constants';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('pageFetcher');

/**
 * Récupération serveur du titre/métas d'une page distante (spec §3.4 : c'est
 * le serveur qui charge la page, jamais le navigateur — le contenu ne
 * s'affiche jamais devant l'utilisateur).
 *
 * L'URL vient du navigateur : sans garde-fous, c'est un SSRF dans le réseau
 * local (spec §8.1). Gardes appliquées :
 * - schémas http/https uniquement ;
 * - IP résolue jamais privée/loopback/link-local — re-vérifiée À CHAQUE
 *   redirection, via le `lookup` custom du socket (l'adresse contrôlée est
 *   exactement celle utilisée pour la connexion : pas de TOCTOU DNS) ;
 * - max 3 redirections, délai global 5 s, corps plafonné 256 Ko (flux) ;
 * - aucun cookie, aucune authentification, aucun en-tête transmis.
 */

export type PageEvidence = {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
};

/** 4 champs extraits ⇒ l'évidence totale reste sous EVIDENCE_MAX_CHARS (§8.2). */
const FIELD_MAX_CHARS = EVIDENCE_MAX_CHARS / 4;

// --- Garde d'adresse ---

function isForbiddenIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true; // 0/8, 10/8, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGN)
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a >= 224) return true; // multicast + réservé + broadcast
  return false;
}

export function isForbiddenAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isForbiddenIpv4(ip);
  if (version !== 6) return true; // pas une IP → on refuse

  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) → re-vérifier l'IPv4 embarquée
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isForbiddenIpv4(mapped[1]);

  if (lower === '::' || lower === '::1') return true; // unspecified, loopback
  const firstGroup = parseInt(lower.split(':')[0] || '0', 16);
  if ((firstGroup & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((firstGroup & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
  if ((firstGroup & 0xffc0) === 0xfec0) return true; // fec0::/10 (site-local, déprécié)
  if ((firstGroup & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  return false;
}

/**
 * `lookup` injecté dans le socket : la résolution DNS passe par ici, et toute
 * adresse interdite fait échouer la connexion — y compris après redirection.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    if (!list.length || list.some((a) => isForbiddenAddress(a.address))) {
      callback(new Error(`Forbidden address for ${hostname}`), '', 0);
      return;
    }
    // Node 24 (autoSelectFamily) appelle lookup avec all:true et attend un
    // tableau ; l'appel historique attend (address, family).
    if ((options as dns.LookupAllOptions).all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

// --- Extraction titre / métas ---

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function clean(text: string | undefined): string | null {
  if (!text) return null;
  const value = decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, FIELD_MAX_CHARS);
  return value || null;
}

/** `<meta name|property="key" content="...">`, tolérant à l'ordre des attributs. */
function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:name|property)\\s*=\\s*["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return clean(match[1]);
  }
  return null;
}

export function extractEvidence(html: string): PageEvidence {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    title: clean(title?.[1]),
    description: metaContent(html, 'description'),
    ogTitle: metaContent(html, 'og:title'),
    ogDescription: metaContent(html, 'og:description'),
  };
}

// --- Qualité de l'évidence ---

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-zà-ÿ0-9]+/g) ?? [];
}

/**
 * Ce que la page apprend EN PLUS de son propre nom.
 *
 * Beaucoup de pages ne portent qu'un titre d'un mot : « Tiime », « YouTube ».
 * Ce n'est pas une évidence, c'est un écho — le modèle qui « classe la page »
 * classe en réalité le nom de domaine, et se met donc à deviner. On retire donc
 * les mots du domaine et on regarde ce qu'il reste. C'est ce qui a fait ranger
 * `tiime.fr` (logiciel de compta) en « divertissement » : la page ne disait
 * rien, et personne ne s'en apercevait.
 */
export function pageSignal(domain: string, evidence: PageEvidence | null): string {
  if (!evidence) return '';
  const nameWords = new Set(words(domain.replace(/\.[a-z.]+$/, '')));
  const text = [evidence.title, evidence.description, evidence.ogTitle, evidence.ogDescription]
    .filter(Boolean)
    .join(' ');
  return words(text)
    .filter((word) => !nameWords.has(word) && word.length > 2)
    .join(' ');
}

/** La page dit-elle autre chose que sa marque ? Sinon, on ne la croit pas. */
export function saysMoreThanItsName(domain: string, evidence: PageEvidence | null): evidence is PageEvidence {
  return pageSignal(domain, evidence).length >= MIN_PAGE_SIGNAL_CHARS;
}

// --- Fetch avec redirections manuelles ---

type FetchResult = { html: string } | { redirect: string } | null;

function requestOnce(url: URL, timeoutMs: number): Promise<FetchResult> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const resolve = (value: FetchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      resolvePromise(value);
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        // `timeout` est un délai d'INACTIVITÉ socket : un corps au goutte-à-
        // goutte le réinitialise à chaque octet. Le vrai plafond est le
        // `killer` absolu ci-dessous.
        timeout: timeoutMs,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
          // Un UA de robot (`focusServer/1.0`) se fait refouler en 403 par tout
          // ce qui est derrière Cloudflare : leboncoin, urssaf, vercel… La page
          // devenait « illisible », et le classement retombait sur le nom de
          // domaine — là où le modèle invente (cf. ollama.service). On demande
          // donc la page comme le navigateur qui va l'ouvrir juste après.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;

        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          resolve({ redirect: res.headers.location });
          return;
        }

        const contentType = res.headers['content-type'] ?? '';
        // Tout 2xx, pas seulement 200 : `amazon.fr` répond 202 avec sa page, et
        // l'exiger à 200 la rendait « illisible » — donc devinée sur son nom.
        const ok2xx = status >= 200 && status < 300;
        if (!ok2xx || !contentType.includes('text/html')) {
          res.destroy();
          resolve(null);
          return;
        }

        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size >= PAGE_FETCH_MAX_BYTES) {
            chunks.push(chunk.subarray(0, chunk.length - (size - PAGE_FETCH_MAX_BYTES)));
            res.destroy(); // on parse ce qu'on a — title/métas sont dans le <head>
          } else {
            chunks.push(chunk);
          }
        });
        res.on('close', () => resolve({ html: Buffer.concat(chunks).toString('utf-8') }));
        res.on('error', () => resolve({ html: Buffer.concat(chunks).toString('utf-8') }));
      },
    );

    // Plafond absolu, indépendant de l'activité du socket.
    const killer = setTimeout(() => {
      req.destroy(new Error('deadline'));
      resolve(null);
    }, timeoutMs);

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.end();
  });
}

/** L'URL est-elle admissible ? (schéma + pas d'IP littérale interdite) */
function validateUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.replace(/^\[|\]$/g, ''); // IPv6 littérale entre crochets
  if (net.isIP(host) && isForbiddenAddress(host)) return null;
  return url;
}

/**
 * `null` = page injoignable / non-HTML / bloquée par les gardes. L'appelant
 * décide (fail closed côté classifieur).
 */
export async function fetchPageEvidence(rawUrl: string): Promise<PageEvidence | null> {
  const deadline = Date.now() + PAGE_FETCH_TIMEOUT_MS;
  let url = validateUrl(rawUrl);

  for (let hop = 0; hop <= PAGE_FETCH_MAX_REDIRECTS; hop++) {
    if (!url) return null;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    const result = await requestOnce(url, remaining);
    if (!result) return null;

    if ('html' in result) {
      return extractEvidence(result.html);
    }

    // Redirection : ré-appliquer TOUTES les gardes sur la nouvelle URL.
    const next = validateUrl(new URL(result.redirect, url).toString());
    if (!next) {
      log.debug({ from: url.hostname }, 'Redirect target rejected');
      return null;
    }
    url = next;
  }

  return null; // trop de redirections
}
