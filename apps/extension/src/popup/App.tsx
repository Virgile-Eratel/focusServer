import { BlockCurrentSiteButton } from '@/popup/components/BlockCurrentSiteButton';
import { DomainListSheet } from '@/popup/components/DomainListSheet';
import { StatusCard } from '@/popup/components/StatusCard';
import { useFocusStatus } from '@/popup/hooks/useFocusStatus';

export function App() {
  const { status, state, refresh } = useFocusStatus();

  return (
    <div className="space-y-3 p-3">
      <header className="flex items-center justify-between">
        <h1 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">FocusServer</h1>
        <DomainListSheet />
      </header>

      <StatusCard
        state={state}
        status={status}
      />

      <BlockCurrentSiteButton onAdded={() => void refresh()} />
    </div>
  );
}
