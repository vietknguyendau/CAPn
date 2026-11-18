import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Moon, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import type { DayPlan } from '../types';
import { DAY_NAMES, todayISO } from '../lib/date';
import { isWorkout, planDetail, planName, toDayPlan } from '../lib/plan';
import { DayPicker } from '../components/DayPicker';
import { Btn, Panel, Screen, cx } from '../components/ui';

const ICON = { workout: Dumbbell, activity: Sparkles, rest: Moon };

export default function Week() {
  const { data, update, go } = useStore();
  const [editing, setEditing] = useState<number | null>(null);
  const plans = data.settings.weeklyPlan.map(toDayPlan);
  const workouts = plans.filter(isWorkout).length;
  const set = (i: number, p: DayPlan) => update((d) => { d.settings.weeklyPlan = d.settings.weeklyPlan.map(toDayPlan); d.settings.weeklyPlan[i] = p; return d; });
  const upcomingMoves = Object.keys(data.settings.overrides).filter((k) => k >= todayISO()).length;

  return (
    <Screen title="My week" sub={`${workouts} workout${workouts === 1 ? '' : 's'} a week`}
      right={<Btn variant="ghost" onClick={() => go('home')}><ChevronLeft size={18} />Back</Btn>}>
      <p className="text-haze">Tap a day to choose a routine you built, any workout from the library, an activity like basketball or golf, or rest. Your weekly goal counts the workout days.</p>
      <ol className="space-y-2">
        {plans.map((p, i) => {
          const Icon = ICON[p.kind];
          return (
            <li key={i}>
              <button onClick={() => setEditing(i)} className={cx('flex w-full items-center gap-3 rounded-2xl border bg-deck p-4 text-left active:bg-rim/60',
                p.kind === 'workout' ? 'border-sun/40' : 'border-rim')}>
                <span className="w-11 shrink-0 font-display text-lg text-haze">{DAY_NAMES[i].slice(0, 3)}</span>
                <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', p.kind === 'workout' ? 'bg-sun text-ink' : p.kind === 'activity' ? 'bg-tide/20 text-tide' : 'bg-rim text-haze')}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-xl font-semibold leading-tight">{planName(p, data)}</span>
                  <span className="block truncate text-sm text-haze">{planDetail(p, data)}</span>
                </span>
                <ChevronRight size={18} className="text-haze" />
              </button>
            </li>
          );
        })}
      </ol>
      {upcomingMoves > 0 && (
        <Panel>
          <p className="text-sm">You have {upcomingMoves} one-off change{upcomingMoves > 1 ? 's' : ''} coming up (days you moved or swapped).</p>
          <Btn variant="quiet" className="mt-1 px-0" onClick={() => update((d) => { d.settings.overrides = Object.fromEntries(Object.entries(d.settings.overrides).filter(([k]) => k < todayISO())); return d; })}>Clear them</Btn>
        </Panel>
      )}
      {editing != null && (
        <DayPicker title={`Every ${DAY_NAMES[editing]}`} current={plans[editing]} onClose={() => setEditing(null)}
          onPick={(p) => { set(editing, p); setEditing(null); }} />
      )}
    </Screen>
  );
}
