import { HeartPulse, Moon, Footprints, Flame } from 'lucide-react';
import { useStore } from '../store';
import { fmtSleep, readiness } from '../lib/health';
import { todayISO } from '../lib/date';
import { startSession } from '../lib/session';
import { Btn, Panel, cx } from './ui';
import { useFitbit } from './FitbitProvider';

export function ReadinessCard({ strengthDay }: { strengthDay: boolean }) {
  const { data, update, go } = useStore();
  const fitbit = useFitbit();
  const today = todayISO();
  const r = readiness(data.healthDays, today);
  const t = data.healthDays.find((d) => d.date === today);

  if (!r) {
    if (fitbit?.status?.connected && !fitbit.status.needsReconnect) {
      return (
        <Panel>
          <p className="text-sm text-haze">No sleep data for last night yet. Open the Fitbit app to sync your watch, then tap Sync now in Settings.</p>
        </Panel>
      );
    }
    if (fitbit?.status?.needsReconnect) {
      return (
        <Panel>
          <p className="text-sm">Fitbit needs a quick reconnect to keep your sleep and heart rate coming in.</p>
          <Btn variant="ghost" className="mt-2" onClick={fitbit.connect}>Reconnect Fitbit</Btn>
        </Panel>
      );
    }
    return null;
  }
  return (
    <Panel>
      <p className={cx('text-sm', r.level === 'easy' ? 'text-sun' : 'text-tide')}>From your Fitbit</p>
      <h2 className="font-display text-2xl font-semibold leading-tight">{r.title}</h2>
      <p className="mt-1 text-haze">{r.detail}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-ink py-2"><Moon size={16} className="mx-auto text-haze" /><dd className="font-display text-xl">{fmtSleep(r.sleepMin)}</dd><dt className="text-xs text-haze">sleep</dt></div>
        <div className="rounded-xl bg-ink py-2"><HeartPulse size={16} className="mx-auto text-haze" /><dd className="font-display text-xl">{r.restingHr ?? '–'}</dd><dt className="text-xs text-haze">{r.baselineHr ? `resting (usual ${r.baselineHr})` : 'resting bpm'}</dt></div>
        <div className="rounded-xl bg-ink py-2"><Footprints size={16} className="mx-auto text-haze" /><dd className="font-display text-xl">{t?.steps != null ? t.steps.toLocaleString() : '–'}</dd><dt className="text-xs text-haze">steps today</dt></div>
      </dl>
      {r.level === 'easy' && strengthDay && (
        <Btn variant="ghost" className="mt-3 w-full" onClick={() => { update((d) => startSession(d, 'quick')); go('train'); }}>Start the 15-minute version</Btn>
      )}
      {t?.caloriesOut != null && <p className="mt-2 flex items-center gap-1.5 text-sm text-haze"><Flame size={14} className="text-tide" />{t.caloriesOut.toLocaleString()} kcal burned so far today</p>}
      <p className="mt-2 text-xs text-haze">A training suggestion from your own trends, not medical advice.</p>
    </Panel>
  );
}
