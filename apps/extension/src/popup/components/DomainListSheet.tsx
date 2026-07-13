import { useState } from 'react';
import type { DomainEntryResponse } from '@focus/shared';
import { ListIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { api } from '@/popup/lib/api';

type ListState = 'loading' | 'ready' | 'error';

/**
 * Vue secondaire, en lecture seule : la liste n'encombre pas l'écran principal.
 * Les entrées sont chargées à chaque ouverture — aucun cache, et rien n'est
 * demandé au serveur tant que le panneau reste fermé.
 */
export function DomainListSheet() {
  const [state, setState] = useState<ListState>('loading');
  const [entries, setEntries] = useState<DomainEntryResponse[]>([]);

  async function handleOpenChange(open: boolean) {
    if (!open) return;

    setState('loading');
    try {
      const { entries: fetched } = await api.getDomainEntries();
      setEntries(fetched);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  return (
    <Sheet onOpenChange={(open) => void handleOpenChange(open)}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voir les sites bloqués"
        >
          <ListIcon />
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sites bloqués</SheetTitle>
          <SheetDescription>
            {state === 'ready'
              ? `${entries.length} domaine${entries.length > 1 ? 's' : ''} dans la blocklist`
              : 'Blocklist du serveur'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {state === 'loading' && <p className="text-muted-foreground text-xs">Chargement…</p>}

          {state === 'error' && <p className="text-destructive text-xs">Impossible de charger la liste.</p>}

          {state === 'ready' && entries.length === 0 && (
            <p className="text-muted-foreground text-xs">Aucun domaine bloqué.</p>
          )}

          {state === 'ready' && entries.length > 0 && (
            <ul className="divide-border divide-y">
              {entries.map((entry) => (
                <li
                  key={entry.domain}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="truncate text-xs">{entry.domain}</span>
                  {entry.tags.length > 0 && (
                    <span className="flex shrink-0 gap-1">
                      {entry.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
