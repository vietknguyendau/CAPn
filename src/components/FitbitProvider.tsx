import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { fitbitApi, syncRange, type FitbitStatus } from '../lib/health';

interface Fitbit {
  status: FitbitStatus | null;
  syncing: boolean;
  message: { ok: boolean; text: string } | null;
  connect: () => Promise<void>;
  syncNow: (days?: number) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Fitbit | null>(null);
export const useFitbit = () => useContext(Ctx);

const LABEL: Record<string, string> = { sleep: 'sleep', restingHr: 'resting heart rate', steps: 'steps', calories: 'calories burned' };

export function FitbitProvider({ children }: { children: ReactNode }) {
  const { update } = useStore();
  const [status, setStatus] = useState<FitbitStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<Fitbit['message']>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    try { setStatus(await fitbitApi.status()); } catch { setStatus({ configured: false, connected: false }); }
  }, []);

  const syncNow = useCallback(async (days = 14) => {
    setSyncing(true);
    try {
      const { from, to } = syncRange(days);
      const r = await fitbitApi.sync(from, to);
      const now = new Date().toISOString();
      update((d) => {
        const byDate = new Map(d.healthDays.map((h) => [h.date, h]));
        for (const day of r.days) byDate.set(day.date, { ...day, id: day.date, source: 'fitbit', syncedAt: now });
        d.healthDays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        return d;
      });
      setMessage(r.missing.length
        ? { ok: true, text: `Synced. ${r.missing.map((m) => LABEL[m] ?? m).join(' and ')} not shared or not available.` }
        : { ok: true, text: `Synced ${r.days.length} day${r.days.length === 1 ? '' : 's'} from Fitbit.` });
      await refresh();
    } catch (e: any) {
      if (e?.reconnect) await refresh();
      setMessage({ ok: false, text: e?.message ?? 'Sync failed.' });
    } finally { setSyncing(false); }
  }, [update, refresh]);

  const connect = useCallback(async () => {
    try { const { url } = await fitbitApi.start(); window.location.assign(url); }
    catch (e: any) { setMessage({ ok: false, text: e?.message ?? 'Couldn’t start the Fitbit connection.' }); }
  }, []);

  const disconnect = useCallback(async () => {
    try { await fitbitApi.disconnect(); setMessage({ ok: true, text: 'Fitbit disconnected. Your synced history stays in Momentum.' }); await refresh(); }
    catch (e: any) { setMessage({ ok: false, text: e?.message ?? 'Couldn’t disconnect.' }); }
  }, [refresh]);

  // On load: handle the return from Google, then auto-sync if it's been a while.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const result = q.get('fitbit');
      if (result) {
        history.replaceState(null, '', window.location.pathname);
        if (result === 'cancelled') setMessage({ ok: false, text: 'Fitbit connection cancelled.' });
        else if (result !== 'connected') setMessage({ ok: false, text: 'Couldn’t connect Fitbit. Try again from Settings.' });
      }
      try {
        const s = await fitbitApi.status();
        setStatus(s);
        if (result === 'connected') { setMessage({ ok: true, text: 'Fitbit connected. Pulling your last 30 days…' }); await syncNow(30); return; }
        const stale = !s.lastSyncAt || Date.now() - Date.parse(s.lastSyncAt) > 60 * 60_000;
        if (s.connected && !s.needsReconnect && stale) await syncNow(7);
      } catch { setStatus({ configured: false, connected: false }); }
    })();
  }, [syncNow]);

  return <Ctx.Provider value={{ status, syncing, message, connect, syncNow, disconnect, refresh }}>{children}</Ctx.Provider>;
}
