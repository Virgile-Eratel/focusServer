import type { CategoryState, FocusStatusResponse } from '@focus/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NextTransition } from '@/popup/components/NextTransition';
import type { StatusState } from '@/popup/hooks/useFocusStatus';
import { API_BASE_URL } from '@/lib/api';
import { CATEGORY_LABELS } from '@/lib/categoryLabels';

type Props = {
  state: StatusState;
  status: FocusStatusResponse | null;
};

/**
 * Le badge se déduit des DONNÉES du serveur, pas d'une politique recopiée
 * ici : `nextTransition === null` signifie que l'état de la catégorie ne
 * change jamais avec le planning (« Toujours » / « Jamais »).
 */
function CategoryBadge({ state }: { state: CategoryState }) {
  const constant = state.nextTransition === null;
  if (state.blocked) {
    return <Badge variant="destructive">{constant ? 'Always blocked' : 'Blocked'}</Badge>;
  }
  return constant ? <Badge variant="secondary">Never blocked</Badge> : <Badge variant="success">Unblocked</Badge>;
}

function CategoryRows({ status }: { status: FocusStatusResponse }) {
  // Garde de version : un vieux serveur ne renvoie pas encore `categories`.
  const categories = status.categories ?? [];
  const scheduled = categories.find((c) => c.nextTransition !== null);

  return (
    <div className="space-y-2">
      {categories.map((category) => (
        <div
          key={category.category}
          className="flex items-center justify-between"
        >
          <span className="text-xs">{CATEGORY_LABELS[category.category]}</span>
          <CategoryBadge state={category} />
        </div>
      ))}

      {scheduled && <NextTransition transition={scheduled.nextTransition} />}
    </div>
  );
}

export function StatusCard({ state, status }: Props) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Status</span>
          {state === 'loading' && <Badge variant="secondary">…</Badge>}
          {state === 'unreachable' && <Badge variant="outline">Server unreachable</Badge>}
          {/* 'unknown' : le serveur tourne mais n'a pas encore appliqué son premier tick. */}
          {state === 'ready' && status?.mode === 'unknown' && <Badge variant="secondary">Unknown</Badge>}
        </div>

        {state === 'ready' && status && <CategoryRows status={status} />}

        {state === 'unreachable' && (
          <p className="text-muted-foreground text-xs">Cannot reach {API_BASE_URL} — is focusServer running?</p>
        )}
      </CardContent>
    </Card>
  );
}
