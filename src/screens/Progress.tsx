import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { EXERCISES, unitLabel } from '../data/exercises';
import { avgPostMood, moodPairs, personalRecords, planFor, strengthSeries, weeklyStreak } from '../lib/stats';
import { isWorkout, toDayPlan } from '../lib/plan';
import { addDays, fmtShort, parseISO, toISO, todayISO, uid, weekStart } from '../lib/date';
import { Bars, LineChart } from '../components/charts';
import { Badge, Btn, H2, Panel, Screen, cx } from '../components/ui';

const short = (iso: string) => { const d = parseISO(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export default function Progress() {
  const { data, update } = useStore();
  const TRACKED = [...new Set(data.workouts.flatMap((w) => w.exercises.filter((e) => EXERCISES[e.exerciseId]?.kind === 'strength' && e.sets.some((x) => x.weight != null)).map((e) => e.exerciseId)))];
  const [pick, setEx] = useState('lat-pulldown');
  const ex = TRACKED.includes(pick) ? pick : TRACKED[0] ?? 'lat-pulldown';
  const series = strengthSeries(ex, data.workouts);
  const units = [...new Set(series.map((s) => s.unit))];
  const prs = personalRecords(data.workouts);
  const pairs = moodPairs(data).slice(-10);
  const avg = avgPostMood(data);
  const streak = weeklyStreak(data.workouts);

  const weeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(new Date(), -7 * (7 - i))));
  const perWeek = weeks.map((w) => { const s = toISO(w), e = toISO(addDays(w, 6)); return data.workouts.filter((x) => x.date >= s && x.date <= e).length; });
  const target = data.settings.weeklyPlan.map(toDayPlan).filter(isWorkout).length || 3;
  const soreness = [...data.workouts].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);

  return (
    <Screen title="Progress" sub={streak ? `${streak}-week streak of showing up` : 'Every logged session counts'}>
      <Panel>
        <H2>Strength</H2>
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {TRACKED.map((id) => (
            <button key={id} onClick={() => setEx(id)} aria-pressed={ex === id}
              className={cx('min-h-[40px] shrink-0 rounded-full border px-3 text-sm', ex === id ? 'border-sun bg-sun text-ink font-semibold' : 'border-rim text-haze')}>
              {EXERCISES[id].name}
            </button>
          ))}
        </div>
        <LineChart labels={series.map((s) => short(s.date))} series={[{ label: 'Top set', color: '#F4B740', values: series.map((s) => s.weight) }]}
          unit={`Top set per session, ${units.map(unitLabel).join(' / ') || '–'}${EXERCISES[ex].perHand ? ' per hand' : ''}${series.some((s) => !s.confirmed) ? ' (unit unverified)' : ''}`} />
        {units.length > 1 && <p className="mt-2 text-sm text-flare">Mixed units logged for this exercise. Confirm the machine unit in Settings.</p>}
        {series.length === 1 && <p className="mt-2 text-sm text-haze">One session so far. Your trend line starts after the next one.</p>}
      </Panel>

      <Panel>
        <H2>Personal records</H2>
        {Object.keys(prs).length === 0 && <p className="text-haze">Your best lifts show up here after your first logged workout.</p>}
        <ul className="divide-y divide-rim">
          {Object.entries(prs).map(([id, pr]) => (
            <li key={id} className="flex items-baseline justify-between gap-2 py-2">
              <span>{EXERCISES[id].name}</span>
              <span className="text-right">
                <span className="font-display text-xl font-semibold">{pr.weight} {pr.unit}{EXERCISES[id].perHand ? ' ea' : ''}</span>
                <span className="block text-xs text-haze">{pr.reps != null ? `× ${pr.reps} · ` : ''}{fmtShort(pr.date)}{!pr.confirmed ? ' · unit unverified' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <H2 aside={`target ${target}/week`}>Consistency</H2>
        <Bars values={perWeek} labels={weeks.map((w) => short(toISO(w)))} target={target} />
      </Panel>

      <Calendar />

      <Panel tone="tide">
        <H2 aside={avg != null ? `avg after: ${avg}/10` : undefined}>Mood before vs. after</H2>
        <LineChart min={1} max={10} labels={pairs.map((p) => short(p.date))}
          series={[{ label: 'Before', color: '#93A1B5', values: pairs.map((p) => p.pre) }, { label: 'After', color: '#67C6B3', values: pairs.map((p) => p.post) }]} />
        <p className="mt-2 text-xs text-haze">Gaps mean no check-in was logged. Patterns here show what you recorded, not proof that exercise caused the change.</p>
      </Panel>

      <Panel>
        <H2>Recovery and soreness</H2>
        <LineChart min={1} max={5} labels={soreness.map((w) => short(w.date))} series={[{ label: 'Soreness', color: '#E9828F', values: soreness.map((w) => w.soreness) }]} unit="1 = none, 5 = very sore" />
        {soreness.slice(-1)[0]?.soreness != null && (soreness.slice(-1)[0].soreness ?? 0) >= 4 && (
          <p className="mt-2 text-sm">You logged high soreness last time. Keep weights the same next session, or swap in the 15-minute version.</p>
        )}
      </Panel>

      {data.settings.trackBodyweight && <Bodyweight />}
      {!data.settings.trackBodyweight && (
        <Btn variant="quiet" onClick={() => update((d) => { d.settings.trackBodyweight = true; return d; })}>Track bodyweight (optional)</Btn>
      )}
    </Screen>
  );
}

function Calendar() {
  const { data } = useStore();
  const [offset, setOffset] = useState(0);
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + offset);
  const first = weekStart(base);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i)).filter((_, i, all) => all.slice(i - (i % 7), i - (i % 7) + 7).some((d) => d.getMonth() === base.getMonth()));
  const month = base.getMonth();
  const today = todayISO();
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex">
          <button aria-label="Previous month" className="grid h-11 w-11 place-items-center text-haze" onClick={() => setOffset(offset - 1)}><ChevronLeft /></button>
          <button aria-label="Next month" className="grid h-11 w-11 place-items-center text-haze" onClick={() => setOffset(offset + 1)}><ChevronRight /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-haze">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        {cells.map((c) => {
          const iso = toISO(c);
          const did = data.workouts.some((w) => w.date === iso);
          const planned = isWorkout(planFor(iso, data.settings));
          if (c.getMonth() !== month && cells.indexOf(c) >= 35 && c.getDate() > 7) return null;
          return (
            <span key={iso} className={cx('grid aspect-square place-items-center rounded-lg text-sm',
              c.getMonth() !== month && 'opacity-30',
              did ? 'bg-sun font-semibold text-ink' : planned && iso > today ? 'border border-dashed border-sun/40 text-chalk' : 'text-chalk',
              iso === today && !did && 'ring-1 ring-chalk')}>{c.getDate()}</span>
          );
        })}
      </div>
      <p className="mt-2 flex gap-3 text-xs text-haze"><Badge tone="sun">Worked out</Badge><span>Dashed: planned workout day</span></p>
    </Panel>
  );
}

function Bodyweight() {
  const { data, update } = useStore();
  const [val, setVal] = useState('');
  const entries = [...data.bodyweight].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const save = () => {
    const v = Number(val);
    if (!v) return;
    update((d) => { d.bodyweight = d.bodyweight.filter((b) => b.date !== todayISO()); d.bodyweight.push({ id: uid(), date: todayISO(), value: v, unit: d.settings.defaultUnit }); return d; });
    setVal('');
  };
  return (
    <Panel>
      <H2 aside="optional">Bodyweight</H2>
      <LineChart labels={entries.map((e) => short(e.date))}
        series={[{ label: 'Bodyweight', color: '#EDF0F4', values: entries.map((e) => e.value) },
          ...(data.settings.goal?.targetWeight != null ? [{ label: 'Goal', color: '#F4B740', values: entries.map(() => data.settings.goal!.targetWeight) }] : [])]}
        unit={data.settings.goal?.unit ?? data.settings.defaultUnit} />
      <div className="mt-3 flex gap-2">
        <input inputMode="decimal" type="number" value={val} onChange={(e) => setVal(e.target.value)} placeholder={`Today, ${data.settings.defaultUnit}`} aria-label="Today's bodyweight"
          className="min-h-[44px] flex-1 rounded-xl border border-rim bg-ink px-3 outline-none focus:border-sun" />
        <Btn variant="ghost" onClick={save}>Log</Btn>
      </div>
      <p className="mt-2 text-xs text-haze">Weight moves day to day. Look at the trend over weeks, not single readings.</p>
    </Panel>
  );
}
