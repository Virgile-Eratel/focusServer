import type { ScheduledTransition } from '@focus/shared';

import { formatCountdown, formatDay, formatTime } from '@/popup/lib/schedule';

type Props = {
  transition: ScheduledTransition | null;
};

export function NextTransition({ transition }: Props) {
  if (!transition) {
    return <p className="text-muted-foreground text-xs">No scheduled change.</p>;
  }

  const at = new Date(transition.at);
  const now = new Date();
  // La transition ne concerne que la catégorie divertissement : adult et
  // other ne changent jamais d'état.
  const label = transition.mode === 'blocked' ? 'Entertainment blocked again' : 'Entertainment unblocked';

  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-medium">
        {formatDay(at, now)} at {formatTime(at)}
      </p>
      <p className="text-muted-foreground text-xs">{formatCountdown(at, now)}</p>
    </div>
  );
}
