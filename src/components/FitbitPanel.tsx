import { RefreshCw, Unplug, Watch } from 'lucide-react';
import { useAccount } from '../store';
import { useFitbit } from './FitbitProvider';
import { Btn, H2, Panel } from './ui';

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export function FitbitPanel() {
  const account = useAccount();
  const fitbit = useFitbit();

  if (!account || !fitbit) {
    return (
      <Panel>
        <H2>Fitbit</H2>
        <p className="text-sm text-haze">Connecting Fitbit needs accounts turned on first. Follow SUPABASE_SETUP.md, then FITBIT_SETUP.md.</p>
      </Panel>
    );
  }
  const { status, syncing, message } = fitbit;
  return (
    <Panel tone={status?.connected && !status.needsReconnect ? 'tide' : undefined}>
      <H2 aside={status?.connected ? (status.needsReconnect ? 'Needs reconnect' : 'Connected') : undefined}>Fitbit</H2>
      {!status && <p className="text-sm text-haze">Checking…</p>}
      {status && !status.configured && (
        <p className="text-sm text-haze">Fitbit isn’t set up on the server yet. Follow FITBIT_SETUP.md to add your Google keys in Vercel.</p>
      )}
      {status?.configured && !status.connected && (
        <>
          <p className="text-sm">Momentum reads your sleep, resting heart rate, steps and calories burned from Fitbit to suggest how hard to train each day and to show those stats next to your mood. It only reads; it never changes your Fitbit data. You can disconnect any time.</p>
          <Btn className="mt-3 w-full" onClick={fitbit.connect}><Watch size={18} />Connect Fitbit</Btn>
        </>
      )}
      {status?.configured && status.connected && (
        <>
          {status.needsReconnect ? (
            <>
              <p className="text-sm">Google asks you to sign in again from time to time while Momentum is a personal app. Reconnect to keep syncing.</p>
              <Btn className="mt-3 w-full" onClick={fitbit.connect}><Watch size={18} />Reconnect Fitbit</Btn>
            </>
          ) : (
            <p className="text-sm text-haze">Last synced {ago(status.lastSyncAt)}. Momentum syncs automatically when you open it.</p>
          )}
          {status.scopes && status.scopes.length > 0 && status.scopes.length < 3 && (
            <p className="mt-2 text-sm text-sun">Some data wasn’t shared. Reconnect and allow sleep, health metrics and activity for the full picture.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Btn variant="ghost" className="flex-1" disabled={syncing || status.needsReconnect} onClick={() => fitbit.syncNow(14)}>
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Syncing…' : 'Sync now'}
            </Btn>
            <Btn variant="ghost" onClick={() => { if (confirm('Disconnect Fitbit? Your already-synced stats stay in Momentum.')) fitbit.disconnect(); }}><Unplug size={16} />Disconnect</Btn>
          </div>
        </>
      )}
      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-tide' : 'text-flare'}`} role="status">{message.text}</p>}
    </Panel>
  );
}
