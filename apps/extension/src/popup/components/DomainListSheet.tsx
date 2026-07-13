import { useState } from 'react';
import type { DomainEntryResponse } from '@focus/shared';
import { ListIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/categoryLabels';

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
          aria-label="View blocked sites"
        >
          <ListIcon />
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>Blocked sites</SheetTitle>
          <SheetDescription>
            {state === 'ready'
              ? `${entries.length} domain${entries.length === 1 ? '' : 's'} in the blocklist`
              : 'Server blocklist'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {state === 'loading' && <p className="text-muted-foreground text-xs">Loading…</p>}

          {state === 'error' && <p className="text-destructive text-xs">Could not load the list.</p>}

          {state === 'ready' && entries.length === 0 && (
            <p className="text-muted-foreground text-xs">No blocked domains.</p>
          )}

          {state === 'ready' && entries.length > 0 && (
            <ul className="divide-border divide-y">
              {entries.map((entry) => (
                <li
                  key={entry.domain}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <span className="truncate text-xs">{entry.domain}</span>
                  <span className="flex shrink-0 gap-1">
                    {/* « AI » : entrée ajoutée par le classifieur, pas par un humain. */}
                    {entry.source === 'ollama' && <Badge variant="outline">AI</Badge>}
                    <Badge variant={entry.category === 'adult' ? 'destructive' : 'secondary'}>
                      {CATEGORY_LABELS[entry.category]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
