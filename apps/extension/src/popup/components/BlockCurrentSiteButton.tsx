import { useEffect, useState } from 'react';
import { FocusApiError } from '@focus/api-client';
import { ShieldPlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { api } from '@/popup/lib/api';
import { getCurrentTabDomain } from '@/popup/lib/currentTab';

type Feedback = { kind: 'success' | 'error'; message: string };

function describeError(error: unknown, domain: string): string {
  if (error instanceof FocusApiError) {
    if (error.status === 409) return `${domain} est déjà bloqué.`;
    if (error.status === 400) return `${domain} n'est pas un domaine valide.`;
    return `Erreur serveur (${error.status}).`;
  }
  return 'Impossible de contacter le serveur.';
}

type Props = {
  /** Rejoue le statut après un ajout : la blocklist a changé sur le disque. */
  onAdded: () => void;
};

export function BlockCurrentSiteButton({ onAdded }: Props) {
  // `undefined` = onglet en cours de résolution, `null` = page non blocable
  // (chrome://, about:blank). Les distinguer évite d'annoncer « aucun site »
  // pendant le chargement.
  const [domain, setDomain] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    void getCurrentTabDomain().then(setDomain);
  }, []);

  async function handleClick() {
    if (!domain) return;

    setPending(true);
    setFeedback(null);

    try {
      await api.addDomain(domain);
      // Le service worker repose ses règles declarativeNetRequest.
      void chrome.runtime.sendMessage({ type: 'DOMAINS_UPDATED' }).catch(() => {});
      setFeedback({ kind: 'success', message: `${domain} ajouté à la blocklist.` });
      onAdded();
    } catch (error) {
      setFeedback({ kind: 'error', message: describeError(error, domain) });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        className="w-full"
        disabled={!domain || pending}
        onClick={() => void handleClick()}
      >
        <ShieldPlusIcon />
        {domain === undefined ? 'Lecture de l’onglet…' : domain ? `Bloquer ${domain}` : 'Aucun site à bloquer ici'}
      </Button>

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
