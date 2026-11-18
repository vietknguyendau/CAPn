import { useState } from 'react';
import { CalendarPlus, ChevronDown, Clock, Flame, Pencil, Play, Plus, Repeat, Timer, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import type { TemplateId } from '../types';
import { EXERCISES, TEMPLATES } from '../data/exercises';
import { fmtRec, recommend } from '../lib/progression';
import { draftToItems, openForEdit, startCustom, startRepeat, startSession } from '../lib/session';
import { estimate } from '../lib/estimate';
import { addDays, fmtLong, fmtShort, parseISO, toISO, todayISO } from '../lib/date';
import { Badge, Btn, H2, Panel, Screen, cx } from '../components/ui';
import { WorkoutDetail } from '../components/WorkoutDetail';
import { PROGRAMS } from '../data/programs';
import Session from './Session';

export default function Train() {
  const { data } = useStore();
  if (data.active) return <Session />;
  return <TrainHome />;
}

function TrainHome() {
  const { data, update, go, finishedId, setFinishedId, setLogDate } = useStore();
  const [pastDate, setPastDate] = useState(() => toISO(addDays(new Date(), -1)));
  const today = todayISO();
  const [open, setOpen] = useState<string | null>(null);
  const finished = data.workouts.find((w) => w.id === finishedId);
  const start = (t: TemplateId) => { setFinishedId(null); setLogDate(null); update((d) => startSession(d, t)); };
  const loggedThatDay = data.workouts.filter((w) => w.date === pastDate);
  const history = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));

  return (
    <Screen title="Train" sub="Show up. Build momentum. Feel better.">
      {finished && (
        <Panel tone="tide">
          <H2>Workout saved</H2>
          <WorkoutDetail w={finished} data={data} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn variant="ghost" onClick={() => { setFinishedId(null); update((d) => openForEdit(d, finished.id)); }}><Pencil size={16} />Edit</Btn>
            <Btn variant="ghost" onClick={() => setFinishedId(null)}>Done</Btn>
          </div>
        </Panel>
      )}

      <button onClick={() => go('programs')} className="flex w-full items-center gap-4 rounded-2xl border border-sun/40 bg-sun/10 p-4 text-left active:bg-sun/20">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sun text-ink"><Flame size={24} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-2xl font-semibold leading-tight">Workout library</span>
          <span className="block text-sm text-haze">{PROGRAMS.length} ready-made workouts: HIIT, Tabata, EMOM, splits, cardio, mobility</span>
        </span>
      </button>

      {(['full', 'quick'] as TemplateId[]).map((t) => {
        const tpl = TEMPLATES[t];
        const main = tpl.items.filter((i) => i.role === 'main');
        const est = estimate(tpl.items, { warmup: false, cooldown: tpl.cooldown });
        return (
          <Panel key={t} tone={t === 'full' ? 'sun' : undefined}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold">{tpl.title}</h2>
                <p className="text-sm text-haze">Set aside about {est.block} min{t === 'quick' ? ' · for low-energy days' : ' · warm-up and finisher included'}</p>
              </div>
              {t === 'quick' && <Timer className="text-tide" />}
            </div>
            <ul className="mt-3 space-y-1.5">
              {main.map((i) => {
                const def = EXERCISES[i.exerciseId];
                const r = recommend(i.exerciseId, data);
                return (
                  <li key={i.exerciseId} className="flex justify-between gap-2 text-sm">
                    <span>{def.name}</span>
                    <span className="text-haze">{i.sets ?? def.targetSets} × {fmtRec(r, def.perHand)}</span>
                  </li>
                );
              })}
            </ul>
            <Btn size="lg" variant={t === 'full' ? 'primary' : 'ghost'} className="mt-4 w-full" onClick={() => start(t)}><Play size={18} />Start {t === 'full' ? 'workout' : '15 minutes'}</Btn>
          </Panel>
        );
      })}

      {(() => {
        const seen = new Set<string>();
        const recent = history.filter((w) => {
          if (!w.exercises.some((e) => e.sets.length || e.cardio?.completed || e.interval?.completed)) return false;
          const key = w.title + '|' + w.exercises.map((e) => e.exerciseId).join(',');
          if (seen.has(key)) return false; seen.add(key); return true;
        }).slice(0, 4);
        if (!recent.length) return null;
        return (
          <Panel>
            <H2>Repeat a recent workout</H2>
            <p className="mb-2 text-sm text-haze">Same exercises, same order, same number of sets. Weights start from what you did last time.</p>
            <ul className="divide-y divide-rim">
              {recent.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{w.title}</p>
                    <p className="truncate text-sm text-haze">{fmtShort(w.date)} · {w.exercises.filter((e) => !e.skipped).map((e) => e.interval ? e.interval.name : EXERCISES[e.exerciseId]?.name).filter(Boolean).slice(0, 3).join(', ')}{w.exercises.length > 3 ? '…' : ''}</p>
                  </div>
                  <Btn onClick={() => { setFinishedId(null); update((d) => startRepeat(d, w)); }}><Repeat size={16} />Repeat</Btn>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })()}

      <Panel>
        <H2>Build your own</H2>
        <p className="text-sm text-haze">Browse exercises by body part, choose your sets, and see how much time to set aside.</p>
        <Btn variant="ghost" size="lg" className="mt-3 w-full" onClick={() => {
          setLogDate(null);
          update((d) => { d.draft = { items: [], warmup: d.draft.warmup, cooldown: d.draft.cooldown }; return d; });
          go('builder');
        }}><Plus size={18} />Build a new workout</Btn>
        {data.draft.items.length > 0 && (
          <Btn variant="quiet" className="mt-1 w-full" onClick={() => { setLogDate(null); go('builder'); }}>Continue unfinished build ({data.draft.items.length} exercise{data.draft.items.length > 1 ? 's' : ''})</Btn>
        )}
        {data.routines.length > 0 && (
          <ul className="mt-4 divide-y divide-rim border-t border-rim">
            {data.routines.map((r) => {
              const e = estimate(draftToItems(r), { warmup: false, cooldown: r.cooldown });
              return (
                <li key={r.id} className="flex items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="flex items-center gap-1 text-sm text-haze"><Clock size={14} />{e.block} min · {r.items.length} exercises</p>
                  </div>
                  <button aria-label={`Edit ${r.name}`} className="grid h-11 w-11 place-items-center text-haze" onClick={() => {
                    update((d) => { d.draft = { items: structuredClone(r.items), warmup: r.warmup, cooldown: r.cooldown }; return d; }); go('builder');
                  }}><Pencil size={18} /></button>
                  <button aria-label={`Delete ${r.name}`} className="grid h-11 w-11 place-items-center text-haze" onClick={() => {
                    if (confirm(`Delete the routine “${r.name}”?`)) update((d) => { d.routines = d.routines.filter((x) => x.id !== r.id); return d; });
                  }}><Trash2 size={18} /></button>
                  <Btn onClick={() => { setFinishedId(null); update((d) => startCustom(d, r, r.name)); }}><Play size={16} />Start</Btn>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <H2>Log a past workout</H2>
        <p className="text-sm text-haze">Forgot to log one? Pick the day, then enter what you did. No rest timers; just the numbers.</p>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm text-haze">Date</span>
          <input type="date" value={pastDate} max={today} onChange={(e) => e.target.value && setPastDate(e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk [color-scheme:dark]" />
        </label>
        <p className="mt-1 text-sm text-haze">{fmtLong(pastDate)}{loggedThatDay.length ? ` · already has ${loggedThatDay.length} workout${loggedThatDay.length > 1 ? 's' : ''}` : ''}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Btn variant="ghost" onClick={() => { setFinishedId(null); update((d) => startSession(d, 'full', pastDate)); }}><CalendarPlus size={16} />Full-body</Btn>
          <Btn variant="ghost" onClick={() => { setFinishedId(null); update((d) => startSession(d, 'quick', pastDate)); }}><CalendarPlus size={16} />15-minute</Btn>
          {data.routines.map((r) => (
            <Btn key={r.id} variant="ghost" onClick={() => { setFinishedId(null); update((d) => startCustom(d, r, r.name, pastDate)); }}><CalendarPlus size={16} /><span className="truncate">{r.name}</span></Btn>
          ))}
          <Btn variant="ghost" onClick={() => { setLogDate(pastDate); update((d) => { d.draft = { items: [], warmup: d.draft.warmup, cooldown: d.draft.cooldown }; return d; }); go('builder'); }}><Plus size={16} />Pick exercises</Btn>
        </div>
      </Panel>

      <Panel>
        <H2 aside={`${history.length} logged`}>History</H2>
        <ul className="divide-y divide-rim">
          {history.map((w) => (
            <li key={w.id}>
              <button className="flex min-h-[52px] w-full items-center justify-between gap-2 text-left" aria-expanded={open === w.id} onClick={() => setOpen(open === w.id ? null : w.id)}>
                <span>
                  <span className="block font-semibold">{fmtShort(w.date)}</span>
                  <span className="text-sm text-haze">{w.title}</span>
                </span>
                <span className="flex items-center gap-2">
                  {w.seeded && <Badge>Baseline</Badge>}
                  <ChevronDown size={18} className={cx('text-haze transition-transform', open === w.id && 'rotate-180')} />
                </span>
              </button>
              {open === w.id && (
                <div className="pb-4">
                  <WorkoutDetail w={w} data={data} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Btn onClick={() => {
                      if (data.active) { alert('Finish or discard the workout in progress first.'); return; }
                      setFinishedId(null); update((d) => startRepeat(d, w));
                    }}><Repeat size={16} />Do this again</Btn>
                    <Btn variant="ghost" onClick={() => {
                      if (data.active) { alert('Finish or discard the workout in progress first.'); return; }
                      setFinishedId(null); update((d) => openForEdit(d, w.id));
                    }}><Pencil size={16} />Edit</Btn>
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-haze">Date</span>
                    <input type="date" value={w.date} max={today} aria-label="Workout date"
                      onChange={(e) => {
                        const nd = e.target.value; if (!nd) return;
                        update((d) => {
                          const wk = d.workouts.find((x) => x.id === w.id); if (!wk) return d;
                          wk.date = nd;
                          for (const c of d.checkIns) if (c.workoutId === w.id) c.date = nd;
                          return d;
                        });
                      }}
                      className="min-h-[44px] rounded-xl border border-rim bg-ink px-3 text-chalk [color-scheme:dark]" />
                  </label>
                  {!w.seeded && (
                    <Btn variant="quiet" className="mt-2" onClick={() => {
                      if (confirm(`Delete the workout from ${fmtLong(w.date)}?`)) update((d) => ({ ...d, workouts: d.workouts.filter((x) => x.id !== w.id) }));
                    }}><Trash2 size={16} />Delete workout</Btn>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </Screen>
  );
}
