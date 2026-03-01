/**
 * Normalise et valide un hostname.
 * Accepte : hostname brut, URL complète, null, undefined.
 * Retourne null si invalide.
 *
 * Source unique — importée par domain.service.ts ET generate-system-config.ts.
 */
export function normalizeHostname(input: string | null | undefined): string | null {
  const raw = String(input ?? '')
    .trim()
    .toLowerCase();
  if (!raw) return null;

  // Extraction hostname depuis URL
  let host = raw;
  try {
    if (raw.includes('://')) host = new URL(raw).hostname;
  } catch {
    /* ignore */
  }

  // Supprimer path/query/fragment
  host = host.split('/')[0].split('?')[0].split('#')[0];

  // Trailing dot
  if (host.endsWith('.')) host = host.slice(0, -1);

  // Validation
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.includes('.')) return null;
  if (host.startsWith('.') || host.endsWith('.')) return null;
  if (host.includes('..')) return null;

  return host;
}
