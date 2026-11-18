import { useState } from 'react';
import { ArrowRightLeft, CalendarDays, Play, Settings as Gear } from 'lucide-react';
import { useAccount, useStore } from '../store';
import type { DayPlan, TemplateId } from '../types';
import { EXERCISES, TEMPLATES, unitLabel } from '../data/exercises';
import { avgPostMood, nextPlanned, nextStrength, planFor, weekSummary, weeklyStreak, windowStatus } from '../lib/stats';
import { isWorkout, planDetail, planItems, planName, planShort, startPlan, toDayPlan } from '../lib/plan';
import { DayPicker } from '../components/DayPicker';
import { FOCUS_INFO, daysSince, latestWeight, weightPlan } from '../lib/goals';
import { describeInterval } from '../components/IntervalStep';
import { fmtRec, recommend, topSet } from '../lib/progression';
import { startSession, newCheckIn } from '../lib/session';
import { addDays, DAY_NAMES, fmtLong, fmtShort, fmtTime, parseISO, toISO, todayISO } from '../lib/date';
import { Badge, Btn, H2, Panel, Scale, Screen, cx } from '../components/ui';
import { ReadinessCard } from '../components/ReadinessCard';
import { logsOn, nutritionOf, sum } from '../lib/nutrition';
import { energyOn } from '../lib/energy';


export default function Home() {
  const { data, update, go } = useStore();
  const account = useAccount();
  const firstName = account?.displayName.trim().split(/\s+/)[0];
  const today = todayISO();
  const plan = planFor(today, data.settings);
  const doneToday = data.workouts.filter((w) => w.date === today);
  const week = weekSummary(data);
  const streak = weeklyStreak(data.workouts);
  const avgMood = avgPostMood(data);
  const last = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))[0];
  const lastPost = last ? data.checkIns.find((c) => c.id === last.postCheckInId) : null;
  const tomorrow = nextPlanned(data);
  const nextLift = nextStrength(data);
  const win = windowStatus(data.settings);

  const [dayEdit, setDayEdit] = useState<{ iso: string; idx: number } | null>(null);
  const start = (t: TemplateId) => { update((d) => startSession(d, t)); go('train'); };
  const startToday = () => { update((d) => { if (!startPlan(d, plan)) startSession(d, 'full'); return d; }); go('train'); };
  const moveToTomorrow = () => update((d) => {
    const tmr = toISO(addDays(parseISO(today), 1));
    const tomorrowPlan = planFor(tmr, d.settings);
    d.settings.overrides[today] = isWorkout(tomorrowPlan) ? { kind: 'rest' } : tomorrowPlan;
    d.settings.overrides[tmr] = plan;
    return d;
  });
  const setDay = (iso: string, idx: number, p: DayPlan, scope: 'once' | 'always') => update((d) => {
    if (scope === 'always') { d.settings.weeklyPlan = d.settings.weeklyPlan.map(toDayPlan); d.settings.weeklyPlan[idx] = p; delete d.settings.overrides[iso]; }
    else d.settings.overrides[iso] = p;
    return d;
  });

  return (
    <Screen title={firstName ? `Hi, ${firstName}` : 'Momentum'} sub={fmtLong(today)}
      right={<button onClick={() => go('settings')} aria-label="Settings" className="grid h-11 w-11 place-items-center rounded-xl border border-rim text-haze active:bg-rim"><Gear size={20} /></button>}>

      <Panel tone="sun">
        {doneToday.length > 0 ? (
          <>
            <p className="text-sm text-sun">Today’s done</p>
            <h2 className="font-display text-3xl font-semibold leading-tight">{doneToday[0].title}</h2>
            {lastPost?.mood != null && last?.date === today && (
              <p className="mt-1 text-haze">Post-workout mood <span className="font-display text-2xl text-tide">{lastPost.mood}/10</span></p>
            )}
            {tomorrow && (
              <div className="mt-4 border-t border-rim pt-4">
                <p className="text-sm text-haze">Up next · {fmtShort(tomorrow.iso)}</p>
                <p className="font-display text-xl font-semibold">{planName(tomorrow.plan, data)}</p>
                <p className="text-sm text-haze">{planDetail(tomorrow.plan, data)}</p>
              </div>
            )}
            <Btn variant="ghost" className="mt-4 w-full" onClick={() => start('full')}>Log another workout</Btn>
          </>
        ) : plan.kind === 'workout' ? (
          <>
            <p className="text-sm text-sun">Today</p>
            <h2 className="font-display text-3xl font-semibold leading-tight">{planName(plan, data)}</h2>
            <p className="text-sm text-haze">{planDetail(plan, data)}</p>
            <p className="mt-1 text-haze">
              {win.current ? `You’re in ${win.current.label} (${fmtTime(win.current.start)}–${fmtTime(win.current.end)}).`
                : win.next ? `${win.next.label} starts at ${fmtTime(win.next.start)}.`
                : 'Today’s windows have passed. A 15-minute session still counts, or move it to tomorrow.'}
            </p>
            <div className="mt-4 grid gap-2">
              <Btn size="lg" onClick={startToday}><Play size={18} />Start {planName(plan, data)}</Btn>
              <div className="flex gap-2">
                <Btn variant="ghost" className="flex-1" onClick={() => start('quick')}>15-minute version</Btn>
                <Btn variant="ghost" className="flex-1" onClick={moveToTomorrow}><ArrowRightLeft size={16} />Move to tomorrow</Btn>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-sun">Today</p>
            <h2 className="font-display text-3xl font-semibold leading-tight">{planName(plan, data)}</h2>
            <p className="mt-1 text-haze">{planDetail(plan, data)}</p>
            <div className="mt-4 flex gap-2">
              {plan.kind === 'activity' && <Btn className="flex-1" onClick={startToday}><Play size={18} />Log {plan.label}</Btn>}
              <Btn variant="ghost" className="flex-1" onClick={() => go('train')}>Train anyway</Btn>
            </div>
          </>
        )}
      </Panel>

      <GoalCard />

      <ReadinessCard strengthDay={plan.kind === 'workout' && doneToday.length === 0} />

      <MoodCheck />

      <FoodToday />

      <Panel>
        <H2 aside={streak > 0 ? `${streak}-week streak` : 'Tap a day to change it'}>This week</H2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat value={`${week.done}/${week.planned}`} label="workouts" />
          <Stat value={`${week.consistency}%`} label="consistency" />
          <Stat value={week.minutes ? `${week.minutes}` : '–'} label={week.minutesUnknown ? 'min (some unlogged)' : 'minutes'} />
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {week.days.map((iso, i) => {
            const a = planFor(iso, data.settings);
            const done = data.workouts.some((w) => w.date === iso);
            const isToday = iso === today;
            return (
              <button key={iso} onClick={() => setDayEdit({ iso, idx: i })} aria-label={`${DAY_NAMES[i]}: ${planName(a, data)}${done ? ', done' : ''}. Change`}
                className={cx('flex flex-col items-center gap-1 rounded-xl py-2 active:bg-rim/60', isToday && 'bg-ink ring-1 ring-sun')}>
                <span className="text-xs text-haze">{DAY_NAMES[i].slice(0, 1)}</span>
                <span className={cx('grid h-9 w-9 place-items-center rounded-full px-0.5 text-center text-[10px] font-semibold leading-tight',
                  done ? 'bg-sun text-ink' : a.kind === 'workout' ? 'border border-sun/60 text-sun' : a.kind === 'activity' ? 'text-tide' : 'text-haze')}>{planShort(a, data)}</span>
              </button>
            );
          })}
        </div>
        <Btn variant="ghost" className="mt-3 w-full" onClick={() => go('week')}><CalendarDays size={16} />Edit my week</Btn>
        {avgMood != null && <p className="mt-3 text-sm text-haze">Average post-workout mood: <span className="text-tide">{avgMood}/10</span></p>}
      </Panel>

      {nextLift && (() => {
        const np = planFor(nextLift, data.settings);
        const items = (planItems(np, data) ?? []).filter((i) => i.role === 'main');
        return (
          <Panel>
            <H2 aside={fmtShort(nextLift)}>Next: {planName(np, data)}</H2>
            <ul className="space-y-1.5">
              {items.slice(0, 8).map((i, k) => {
                if (i.interval) return <li key={k} className="text-sm"><span>{i.interval.name}</span> <span className="text-haze">· {describeInterval(i.interval).split(':')[0]}</span></li>;
                const def = EXERCISES[i.exerciseId];
                if (!def) return null;
                const r = def.kind === 'cardio' ? null : recommend(i.exerciseId, data);
                return (
                  <li key={k} className="flex justify-between gap-2 text-sm">
                    <span>{def.name}</span>
                    <span className="text-haze">{def.kind === 'cardio' ? `${i.minutes ?? def.defaultMinutes ?? 10} min` : `${fmtRec(r!, def.perHand)}${r!.unit === 'machine' && !r!.unitConfirmed ? ' *' : ''}`}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-haze">Starting points, not rules. Adjust to how sets feel.</p>
          </Panel>
        );
      })()}

      {last && (
        <Panel>
          <H2 aside={fmtShort(last.date)}>Last workout</H2>
          <div className="flex flex-wrap gap-2">
            {last.exercises.filter((e) => !e.cardio && EXERCISES[e.exerciseId]?.kind === 'strength').map((e) => {
              const t = topSet(e.sets);
              return t ? <Badge key={e.id}>{EXERCISES[e.exerciseId].name} {t.weight} {unitLabel(t.unit)}</Badge> : null;
            })}
          </div>
          <Btn variant="quiet" className="mt-2 px-0" onClick={() => go('train')}>See full history</Btn>
        </Panel>
      )}
      {dayEdit && (
        <DayPicker title={fmtLong(dayEdit.iso)} current={planFor(dayEdit.iso, data.settings)} onClose={() => setDayEdit(null)}
          scopeLabel={{ once: `Just ${fmtShort(dayEdit.iso)}`, always: `Every ${DAY_NAMES[dayEdit.idx]}` }}
          onPick={(p, scope) => { setDay(dayEdit.iso, dayEdit.idx, p, scope); setDayEdit(null); }} />
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-ink py-3">
      <p className="font-display text-3xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-haze">{label}</p>
    </div>
  );
}

function MoodCheck() {
  const { data, update, go } = useStore();
  const today = todayISO();
  const existing = [...data.checkIns].reverse().find((c) => c.date === today && c.context === 'daily');
  const [mood, setMood] = useState<number | null>(null);
  if (existing) {
    return (
      <Panel tone="tide">
        <div className="flex items-center justify-between">
          <p>Checked in today: <span className="font-display text-2xl text-tide">{existing.mood ?? '–'}/10</span></p>
          <Btn variant="quiet" onClick={() => go('wellness')}>Details</Btn>
        </div>
      </Panel>
    );
  }
  return (
    <Panel tone="tide">
      <H2>How are you feeling right now?</H2>
      <Scale label="Mood, 1–10" value={mood} onChange={setMood} lowHint="Rough" highHint="Great" />
      <div className="mt-3 flex gap-2">
        <Btn variant="tide" disabled={mood == null} className="flex-1" onClick={() => update((d) => { d.checkIns.push(newCheckIn({ context: 'daily', mood })); return d; })}>Save check-in</Btn>
        <Btn variant="ghost" onClick={() => go('wellness')}>Add more</Btn>
      </div>
    </Panel>
  );
}

function FoodToday() {
  const { data, go } = useStore();
  const day = logsOn(data, todayISO());
  const en = energyOn(data, todayISO());
  if (!day.length && en.burned == null) return null;
  const t = sum(day);
  const n = nutritionOf(data);
  return (
    <button onClick={() => go('food')} className="block w-full text-left">
      <Panel>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">Food today</h2>
          <span className="text-sm text-haze">{day.length} item{day.length > 1 ? 's' : ''}</span>
        </div>
        <p className="mt-1">
          {n.showCalories && <><span className="font-display text-2xl">{t.kcal.toLocaleString()}</span><span className="text-haze">{n.targets.kcal ? ` / ${n.targets.kcal.toLocaleString()}` : ''} kcal · </span></>}
          <span className="font-display text-2xl text-tide">{Math.round(t.protein)}</span><span className="text-haze">{n.targets.protein ? ` / ${n.targets.protein}` : ''} g protein</span>
        </p>
        {n.showCalories && en.burned != null && (
          <p className="mt-1 text-sm text-haze">Burned so far: <span className="text-chalk">{en.burned.toLocaleString()} kcal</span>{en.logged ? ` · ${en.eaten - en.burned >= 0 ? '+' : '−'}${Math.abs(en.eaten - en.burned).toLocaleString()} balance` : ''}</p>
        )}
      </Panel>
    </button>
  );
}

function GoalCard() {
  const { data, update, go } = useStore();
  const goal = data.settings.goal;
  const [w, setW] = useState('');
  const [saved, setSaved] = useState(false);
  if (!goal) {
    return (
      <button onClick={() => go('goal')} className="block w-full text-left">
        <Panel tone="tide">
          <p className="text-sm text-tide">New</p>
          <h2 className="font-display text-2xl font-semibold leading-tight">Set your goal</h2>
          <p className="mt-1 text-sm text-haze">Your weight, what you’re training for and your schedule. Momentum recommends plans that fit.</p>
        </Panel>
      </button>
    );
  }
  const lw = latestWeight(data);
  const wp = weightPlan(goal, lw?.value ?? null);
  const due = !lw || daysSince(lw.date) >= 7;
  const log = () => {
    const v = Number(w); if (!v) return;
    update((d) => { const t = todayISO(); d.bodyweight = d.bodyweight.filter((b) => b.date !== t); d.bodyweight.push({ id: Math.random().toString(36).slice(2), date: t, value: v, unit: goal.unit }); return d; });
    setW(''); setSaved(true);
  };
  return (
    <Panel>
      <button onClick={() => go('goal')} className="block w-full text-left">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">My goal</h2>
          <span className="text-sm text-haze">{goal.focus.map((f) => FOCUS_INFO[f].label).join(' + ')}</span>
        </div>
        {wp ? (
          <>
            <p className="mt-1"><span className="font-display text-3xl">{wp.now}</span><span className="text-haze"> {goal.unit} → </span><span className="font-display text-2xl text-sun">{goal.targetWeight}</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-rim"><div className="h-full rounded-full bg-sun" style={{ width: `${Math.round(wp.progress * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-haze">{wp.dir === 'done' ? 'Goal reached' : `${Math.abs(wp.diff)} ${goal.unit} to go · started at ${goal.startWeight}`}</p>
          </>
        ) : <p className="mt-1 text-sm text-haze">{goal.daysPerWeek} days a week · tap to see your plans</p>}
      </button>
      {due && !saved && (
        <div className="mt-3 flex gap-2 border-t border-rim pt-3">
          <input inputMode="decimal" type="number" value={w} onChange={(e) => setW(e.target.value)} placeholder={`Weekly weigh-in (${goal.unit})`} aria-label="Today's weight"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" />
          <Btn variant="ghost" disabled={!Number(w)} onClick={log}>Log</Btn>
        </div>
      )}
      {saved && <p className="mt-2 text-sm text-tide">Logged. Trends over weeks matter more than any single day.</p>}
    </Panel>
  );
}
