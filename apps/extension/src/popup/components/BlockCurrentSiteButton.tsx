import { useCallback, useEffect, useState } from 'react';
import { FocusApiError } from '@focus/api-client';
import type { Category, DomainEntryResponse } from '@focus/shared';
import { ShieldOffIcon, ShieldPlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { getCurrentTabDomain } from '@/popup/lib/currentTab';

type Feedback = { kind: 'success' | 'error'; message: string };

function describeError(error: unknown, domain: string): string {
  if (error instanceof FocusApiError) {
    if (error.status === 403) return `${domain} cannot be unblocked from here.`;
    if (error.status === 409) return `${domain} is already classified.`;
    if (error.status === 400) return `${domain} is not a valid domain.`;
    return `Server error (${error.status}).`;
  }
  return 'Cannot reach the server.';
}

/**
 * Classer un site à la main. `other` = « ne jamais bloquer » : l'entrée
 * manuelle fait autorité sur tout verdict et n'est plus jamais re-classifiée.
 */
const CHOICES: { value: Category; label: string }[] = [
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'adult', label: 'Adult' },
  { value: 'other', label: 'Never block' },
];

/**
 * La soupape est ASYMÉTRIQUE, et c'est le serveur qui la ferme (403) — l'UI ne
 * fait qu'en donner la raison à l'avance.
 *
 * Ce qu'elle répare : l'IA se trompe, elle range un logiciel de compta en
 * « divertissement », et l'utilisateur doit pouvoir la corriger d'un clic.
 *
 * Ce qu'elle refuse de devenir : la porte de sortie. Au moment où l'on veut
 * débloquer un site, on est exactement la personne qui ne devrait pas décider
 * (§1). Donc un blocage `adult` ne se lève jamais depuis le navigateur, et une
 * entrée qu'on a soi-même posée à froid se défait en éditant domains.json.
 */
function lockReason(entry: DomainEntryResponse): string | null {
  if (entry.category === 'adult') return 'An adult block cannot be lifted from the browser.';
  if (entry.source === 'manual') return 'Site classified by hand — edit domains.json to change it.';
  return null;
}

/** Le libellé porte un nom de domaine : sa longueur n'est pas connue d'avance. */
const ACTION_BUTTON = 'h-auto min-h-9 w-full py-2 leading-tight whitespace-normal';

type Props = {
  /** Rejoue le statut après un changement : la blocklist a changé sur le disque. */
  onAdded: () => void;
};

export function BlockCurrentSiteButton({ onAdded }: Props) {
  // `undefined` = onglet en cours de résolution, `null` = page non blocable
  // (chrome://, about:blank). Les distinguer évite d'annoncer « aucun site »
  // pendant le chargement.
  const [domain, setDomain] = useState<string | null | undefined>(undefined);
  const [entry, setEntry] = useState<DomainEntryResponse | null>(null);
  const [category, setCategory] = useState<Category>('entertainment');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  /** Qui a classé ce domaine ? La réponse décide de ce qu'on a le droit d'offrir. */
  const load = useCallback(async () => {
    const current = await getCurrentTabDomain();
    setDomain(current);
    if (!current) return;

    try {
      const { entries } = await api.getDomainEntries();
      setEntry(entries.find((candidate) => candidate.domain === current) ?? null);
    } catch {
      setEntry(null); // serveur muet : on retombe sur le simple ajout
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleClick() {
    if (!domain) return;

    setPending(true);
    setFeedback(null);

    try {
      // Déjà listé par l'IA → on corrige son verdict ; sinon on ajoute.
      if (entry) {
        await api.overrideDomain(domain, 'other');
      } else {
        await api.addDomain(domain, category);
      }

      // Le service worker repose ses règles declarativeNetRequest.
      void chrome.runtime.sendMessage({ type: 'DOMAINS_UPDATED' }).catch(() => {});
      setFeedback({
        kind: 'success',
        message:
          entry || category === 'other' ? `${domain} will no longer be blocked.` : `${domain} added to the blocklist.`,
      });
      await load();
      onAdded();
    } catch (error) {
      setFeedback({ kind: 'error', message: describeError(error, domain) });
    } finally {
      setPending(false);
    }
  }

  const locked = entry ? lockReason(entry) : null;

  return (
    <div className="space-y-2">
      {locked ? (
        <p className="text-muted-foreground text-center text-xs">{locked}</p>
      ) : entry ? (
        // Verdict de l'IA, non adulte : une seule action a du sens ici.
        <Button
          className={ACTION_BUTTON}
          disabled={pending}
          onClick={() => void handleClick()}
        >
          <ShieldOffIcon />
          {`Stop blocking ${domain}`}
        </Button>
      ) : (
        <>
          <div
            className="grid grid-cols-3 gap-1"
            role="radiogroup"
            aria-label="Site category"
          >
            {CHOICES.map((choice) => (
              <Button
                key={choice.value}
                variant="outline"
                size="sm"
                role="radio"
                aria-checked={category === choice.value}
                // `Button` impose whitespace-nowrap et une hauteur fixe : à trois
                // colonnes égales, « Never block » débordait de la sienne. On lui
                // rend le droit de passer à la ligne.
                className={cn(
                  'h-auto min-h-8 px-1.5 py-1 text-xs leading-tight whitespace-normal',
                  category === choice.value && 'border-primary bg-accent',
                )}
                onClick={() => setCategory(choice.value)}
              >
                {choice.label}
              </Button>
            ))}
          </div>

          <Button
            className={ACTION_BUTTON}
            disabled={!domain || pending}
            onClick={() => void handleClick()}
          >
            {category === 'other' ? <ShieldOffIcon /> : <ShieldPlusIcon />}
            {domain === undefined
              ? 'Reading the current tab…'
              : !domain
                ? 'No site to classify here'
                : category === 'other'
                  ? `Never block ${domain}`
                  : `Block ${domain}`}
          </Button>
        </>
      )}

      {feedback && (
        <p
          className={
            feedback.kind === 'success' ? 'text-success text-center text-xs' : 'text-destructive text-center text-xs'
          }
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
