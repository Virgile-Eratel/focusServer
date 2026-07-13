import type { ScheduledTransition } from '@focus/shared';

import { formatCountdown, formatDay, formatTime } from '@/popup/lib/schedule';

type Props = {
  transition: ScheduledTransition | null;
};

export function NextTransition({ transition }: Props) {
  if (!transition) {
    return <p className="text-muted-foreground text-xs">Aucun changement prévu.</p>;
  }

  const at = new Date(transition.at);
  const now = new Date();
  const label = transition.mode === 'blocked' ? 'Prochain blocage' : 'Prochain déblocage';

  return (
    <div className="space-y-0.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-sm font-medium">
        {formatDay(at, now)} à {formatTime(at)}
      </p>
      <p className="text-muted-foreground text-xs">{formatCountdown(at, now)}</p>
    </div>
  );
}
