import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { AUTO_FINISH_MS, autoFinish } from '../lib/session';
import { Btn } from './ui';

/**
 * Watches a live workout. Taps anywhere in the app keep it alive; running timers ping it too.
 * After 20 minutes with no activity, the workout is saved at the time of the last activity.
 */
export function AutoFinish() {
  const { data, update, setFinishedId, go } = useStore();
  const [notice, setNotice] = useState<{ id: string; at: string } | null>(null);
  const lastPing = useRef(0);
  const live = !!data.active && !data.active.backfill && !data.active.editingId && !!data.active.workout.startedAt;

  // Taps and keys count as activity (throttled to once a minute so it doesn't spam saves).
  useEffect(() => {
    if (!live) return;
    const ping = () => {
      if (Date.now() - lastPing.current < 60_000) return;
      lastPing.current = Date.now();
      update((d) => d);
    };
    window.addEventListener('pointerdown', ping, { passive: true });
    window.addEventListener('keydown', ping);
    return () => { window.removeEventListener('pointerdown', ping); window.removeEventListener('keydown', ping); };
  }, [live, update]);

  // Check now, every 30 seconds, and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!data.active) return;
    const check = () => {
      const a = data.active;
      if (!a || a.pausedAt != null) return;
      const last = a.lastActivityAt ?? (a.workout.startedAt ? Date.parse(a.workout.startedAt) : Date.now());
      if (Date.now() - last < AUTO_FINISH_MS) return;
      let saved: string | null = null;
      update((d) => { saved = autoFinish(d); return d; });
      setTimeout(() => {
        if (saved) { setNotice({ id: saved, at: new Date(last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }); setFinishedId(saved); }
      }, 0);
    };
    check();
    const t = setInterval(check, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [data.active, update, setFinishedId]);

  if (!notice) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto max-w-xl p-3 pt-safe" role="status">
      <div className="rounded-2xl border border-tide/50 bg-deck p-4 shadow-lg">
        <p className="font-semibold">Workout saved automatically</p>
        <p className="mt-1 text-sm text-haze">No activity for 20 minutes, so it was finished at your last activity ({notice.at}). You can edit it in History.</p>
        <div className="mt-3 flex gap-2">
          <Btn variant="tide" className="flex-1" onClick={() => { setNotice(null); go('train'); }}>See workout</Btn>
          <Btn variant="ghost" onClick={() => setNotice(null)}>OK</Btn>
        </div>
      </div>
    </div>
  );
}

/** While a timer runs, keep the workout marked active so long timed blocks never auto-finish. */
export function useKeepAlive(running: boolean) {
  const { update } = useStore();
  useEffect(() => {
    if (!running) return;
    update((d) => d);
    const t = setInterval(() => update((d) => d), 2 * 60_000);
    return () => clearInterval(t);
  }, [running, update]);
}
