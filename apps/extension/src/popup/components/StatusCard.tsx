import type { FocusStatusResponse } from '@focus/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NextTransition } from '@/popup/components/NextTransition';
import type { StatusState } from '@/popup/hooks/useFocusStatus';
import { API_BASE_URL } from '@/popup/lib/api';

type Props = {
  state: StatusState;
  status: FocusStatusResponse | null;
};

function ModeBadge({ mode }: { mode: FocusStatusResponse['mode'] }) {
  if (mode === 'blocked') return <Badge variant="destructive">Bloqué</Badge>;
  if (mode === 'unblocked') return <Badge variant="success">Débloqué</Badge>;

  // 'unknown' : le serveur tourne mais n'a pas encore appliqué son premier tick.
  return <Badge variant="secondary">Indéterminé</Badge>;
}

export function StatusCard({ state, status }: Props) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Statut</span>
          {state === 'loading' && <Badge variant="secondary">…</Badge>}
          {state === 'unreachable' && <Badge variant="outline">Serveur injoignable</Badge>}
          {state === 'ready' && status && <ModeBadge mode={status.mode} />}
        </div>

        {state === 'ready' && status && <NextTransition transition={status.nextTransition} />}

        {state === 'unreachable' && (
          <p className="text-muted-foreground text-xs">
            Impossible de joindre {API_BASE_URL}, focusServer est-il démarré ?
          </p>
        )}
      </CardContent>
    </Card>
  );
}
