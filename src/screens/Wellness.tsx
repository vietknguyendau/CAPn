import { useStore } from '../store';
import { newCheckIn } from '../lib/session';
import { fmtShort, parseISO } from '../lib/date';
import { CheckInForm } from '../components/CheckInForm';
import { LineChart } from '../components/charts';
import { H2, Panel, Screen } from '../components/ui';
import { useState } from 'react';
import { fmtSleep } from '../lib/health';

const short = (iso: string) => { const d = parseISO(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

export default function Wellness() {
  const { data, update } = useStore();
  const [saved, setSaved] = useState(false);

  // One point per day: latest daily or post check-in that day.
  const byDay = new Map<string, (typeof data.checkIns)[number]>();
  [...data.checkIns].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((c) => { if (c.context !== 'pre') byDay.set(c.date, c); });
  const days = [...byDay.values()].slice(-14);

  const workoutDays = new Set(data.workouts.map((w) => w.date));
  const daily = data.checkIns.filter((c) => c.mood != null && c.context !== 'pre');
  const onTrain = avg(daily.filter((c) => workoutDays.has(c.date)).map((c) => c.mood!));
  const offTrain = avg(daily.filter((c) => !workoutDays.has(c.date)).map((c) => c.mood!));
  const enough = daily.filter((c) => workoutDays.has(c.date)).length >= 3 && daily.filter((c) => !workoutDays.has(c.date)).length >= 3;

  const reflections = [...data.checkIns].filter((c) => c.note).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  return (
    <Screen title="Wellness" sub="How training sits with the rest of your life">
      <Panel tone="tide">
        {saved ? (
          <div className="flex items-center justify-between">
            <p>Check-in saved.</p>
            <button className="min-h-[44px] text-sm text-haze" onClick={() => setSaved(false)}>Add another</button>
          </div>
        ) : (
          <CheckInForm fields={['energy', 'stress', 'motivation']} submitLabel="Save check-in" onSubmit={(v) => {
            update((d) => { d.checkIns.push(newCheckIn({ context: 'daily', mood: v.mood, energy: v.energy, stress: v.stress, motivation: v.motivation, note: v.note || undefined })); return d; });
            setSaved(true);
          }} />
        )}
      </Panel>

      <Panel>
        <H2>Mood trend</H2>
        <LineChart min={1} max={10} labels={days.map((c) => short(c.date))} series={[{ label: 'Mood', color: '#67C6B3', values: days.map((c) => c.mood) }]} />
      </Panel>

      <Panel>
        <H2>Energy and stress</H2>
        <LineChart min={1} max={5} labels={days.map((c) => short(c.date))}
          series={[{ label: 'Energy', color: '#F4B740', values: days.map((c) => c.energy) }, { label: 'Stress', color: '#E9828F', values: days.map((c) => c.stress) }]} />
      </Panel>

      {data.healthDays.length > 0 && (() => {
        const hd = [...data.healthDays].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
        const labels = hd.map((d) => short(d.date));
        const moodBy = new Map(data.checkIns.filter((c) => c.mood != null && c.context !== 'pre').map((c) => [c.date, c.mood as number]));
        const rested = data.healthDays.filter((d) => d.sleepMin != null && d.sleepMin >= 420 && moodBy.has(d.date)).map((d) => moodBy.get(d.date)!);
        const short6 = data.healthDays.filter((d) => d.sleepMin != null && d.sleepMin < 420 && moodBy.has(d.date)).map((d) => moodBy.get(d.date)!);
        const avgSleep = avg(hd.map((d) => d.sleepMin).filter((x): x is number => x != null));
        return (
          <>
            <Panel>
              <H2 aside={avgSleep != null ? `avg ${fmtSleep(avgSleep)}` : undefined}>Sleep</H2>
              <LineChart labels={labels} series={[{ label: 'Hours asleep', color: '#93A1B5', values: hd.map((d) => (d.sleepMin == null ? null : Math.round(d.sleepMin / 6) / 10)) }]} unit="hours asleep, from Fitbit" />
              {rested.length >= 3 && short6.length >= 3 && (
                <p className="mt-2 text-sm">Mood after 7+ hours: <span className="font-display text-lg text-tide">{avg(rested)}</span> vs. under 7: <span className="font-display text-lg">{avg(short6)}</span>. A pattern in your logs, not proof of cause.</p>
              )}
            </Panel>
            <Panel>
              <H2>Heart rate, steps and calories</H2>
              <LineChart labels={labels} series={[{ label: 'Resting HR (bpm)', color: '#E9828F', values: hd.map((d) => d.restingHr) }]} />
              <div className="mt-3" />
              <LineChart labels={labels} series={[{ label: 'Steps', color: '#F4B740', values: hd.map((d) => d.steps) }]} unit="steps per day" />
              {hd.some((d) => d.caloriesOut != null) && (
                <div className="mt-3">
                  <LineChart labels={labels} series={[
                    { label: 'Burned', color: '#67C6B3', values: hd.map((d) => d.caloriesOut ?? null) },
                    { label: 'Eaten', color: '#F4B740', values: hd.map((d) => { const l = data.foodLogs.filter((f) => f.date === d.date); return l.length ? Math.round(l.reduce((x, f) => x + f.totals.kcal, 0)) : null; }) },
                  ]} unit="kcal per day" />
                </div>
              )}
            </Panel>
          </>
        );
      })()}

      <Panel>
        <H2>Patterns</H2>
        {enough ? (
          <p>On days you trained, your logged mood averaged <span className="font-display text-xl text-tide">{onTrain}</span>; on other days, <span className="font-display text-xl">{offTrain}</span>.</p>
        ) : (
          <p className="text-haze">Log at least three check-ins on training days and three on other days to compare them.</p>
        )}
        <p className="mt-2 text-sm text-haze">This compares what you’ve recorded. It isn’t proof that exercise caused the difference. Sleep, work and life all play a part.</p>
      </Panel>

      <Panel>
        <H2>Reflections</H2>
        {reflections.length ? (
          <ul className="space-y-3">
            {reflections.map((c) => (
              <li key={c.id}>
                <p className="text-xs text-haze">{fmtShort(c.date)} · {c.context === 'pre' ? 'before workout' : c.context === 'post' ? 'after workout' : 'check-in'}{c.mood != null ? ` · mood ${c.mood}` : ''}</p>
                <p>{c.note}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-haze">Notes from your check-ins show up here.</p>}
      </Panel>

      <p className="px-1 text-xs text-haze">Momentum is a training tool, not a medical or mental health service. If you’re struggling, talk to someone you trust or a professional. In the US, call or text 988 any time.</p>
    </Screen>
  );
}
