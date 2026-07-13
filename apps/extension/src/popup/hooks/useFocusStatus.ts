import { useCallback, useEffect, useState } from 'react';
import type { FocusStatusResponse } from '@focus/shared';

import { api } from '@/lib/api';

export type StatusState = 'loading' | 'ready' | 'unreachable';

/**
 * Statut du serveur, refetché à la demande. Aucun cache : le serveur est en
 * localhost, on relit la vérité à chaque ouverture du popup.
 */
export function useFocusStatus() {
  const [status, setStatus] = useState<FocusStatusResponse | null>(null);
  const [state, setState] = useState<StatusState>('loading');

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.getStatus());
      setState('ready');
    } catch {
      setStatus(null);
      setState('unreachable');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, state, refresh };
}
