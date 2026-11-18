import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, ChevronLeft, ChevronRight, ListOrdered, Pause, Pencil, Play, RotateCcw, Shuffle, SkipForward, Timer, Trash2, Undo2, X } from 'lucide-react';
import { useStore } from '../store';
import type { Difficulty, SetLog, WeightUnit } from '../types';
import { EXERCISES, unitLabel } from '../data/exercises';
import { fmtRec, lastLogFor, lighter, nextSetTip, recommend } from '../lib/progression';
import { liveFatigue, setsBeforeNow, typicalSetsBefore, usualPhrase } from '../lib/fatigue';
import { backfillStamp, goToExercise, newCheckIn, startSession } from '../lib/session';
import { SessionOverview } from '../components/SessionOverview';
import { Scale } from '../components/ui';
import { fmtLong, toISO, uid } from '../lib/date';
import { CheckInForm } from '../components/CheckInForm';
import { ExercisePhotos, ExerciseSteps } from '../components/ExerciseInfo';
import { IntervalStep } from '../components/IntervalStep';
import { ExerciseActions } from '../components/ExerciseActions';
import { HoldTimer } from '../components/HoldTimer';
import { Badge, Btn, Chips, Panel, Stepper, cx } from '../components/ui';
import { summarizeWorkout } from '../lib/coach';

export default function Session() {
  const { data } = useStore();
  const s = data.active;
  if (!s) return null;
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-safe">
      <SessionHeader />
      {s.phase === 'pre' && <PreCheck />}
      {s.phase === 'exercise' && (s.workout.exercises[s.index].interval
        ? <IntervalStep key={s.workout.exercises[s.index].id} />
        : <ExerciseStep key={s.workout.exercises[s.index].id + s.workout.exercises[s.index].exerciseId} />)}
      {s.phase === 'post' && <PostCheck />}
    </div>
  );
}

/** Active workout time in ms: start → now, minus pauses. */
export function elapsedMs(a: { workout: { startedAt: string | null }; pausedAt?: number | null; pausedMs?: number }, now = Date.now()) {
  if (!a.workout.startedAt) return 0;
  const end = a.pausedAt ?? now;
  return Math.max(0, end - Date.parse(a.workout.startedAt) - (a.pausedMs ?? 0));
}
export const clock = (ms: number) => {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

function WorkoutClock() {
  const { data, update } = useStore();
  const a = data.active!;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (a.backfill || !a.workout.startedAt) return null;
  const paused = a.pausedAt != null;
  const toggle = () => update((d) => {
    const x = d.active!;
    if (x.pausedAt != null) { x.pausedMs = (x.pausedMs ?? 0) + (Date.now() - x.pausedAt); x.pausedAt = null; }
    else x.pausedAt = Date.now();
    return d;
  });
  return (
    <button onClick={toggle} aria-label={paused ? 'Resume workout timer' : 'Pause workout timer'}
      className={cx('flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 font-display text-xl font-semibold tabular-nums',
        paused ? 'bg-sun/15 text-sun' : 'bg-tide/15 text-tide')}>
      {paused ? <Play size={16} /> : <Timer size={16} />}
      {clock(elapsedMs(a))}
      {paused && <span className="font-sans text-xs font-semibold uppercase">Paused</span>}
    </button>
  );
}

/** Scrollable row of every exercise in the workout. Tap any one to jump straight to it. */
function ExerciseStrip() {
  const { data, update } = useStore();
  const s = data.active!;
  const current = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<number | null>(null);
  useEffect(() => { // center the current exercise by scrolling the row sideways only, never the page
    const el = current.current, r = row.current;
    if (el && r) r.scrollTo({ left: el.offsetLeft - r.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [s.index, s.phase]);
  const done = (i: number) => { const e = s.workout.exercises[i]; return !e.skipped && (e.sets.length > 0 || e.cardio?.completed || e.interval?.completed); };
  return (
    <div ref={row} className="relative -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Exercises in this workout. Tap one for options">
      {s.workout.exercises.map((e, i) => {
        const isCur = i === s.index && s.phase === 'exercise';
        const name = e.interval ? e.interval.name : EXERCISES[e.exerciseId]?.name ?? 'Exercise';
        const tag = e.role === 'warmup' ? 'Warm-up' : e.role === 'finisher' ? 'Finisher' : null;
        const sets = e.sets.length, target = e.targetSets ?? EXERCISES[e.exerciseId]?.targetSets ?? 0;
        const status = e.skipped ? 'Skipped' : e.interval?.completed || e.cardio?.completed ? 'Done' : sets ? `${sets}/${target} sets` : isCur ? 'Now' : 'Up next';
        return (
          <button key={e.id} ref={isCur ? current : undefined} disabled={s.phase === 'pre'}
            onClick={() => setMenu(i)} aria-current={isCur ? 'step' : undefined} aria-haspopup="dialog" aria-label={`${name}, ${status}. Options`}
            className={cx('flex min-h-[52px] max-w-[11rem] shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left disabled:opacity-60',
              isCur ? 'border-sun bg-sun/15' : e.skipped ? 'border-flare/50' : done(i) ? 'border-tide/50 bg-tide/10' : 'border-rim')}>
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
              done(i) ? 'bg-tide text-ink' : e.skipped ? 'bg-flare/25 text-flare' : isCur ? 'bg-sun text-ink' : 'bg-rim text-haze')}>
              {done(i) ? <Check size={14} /> : e.skipped ? <SkipForward size={12} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cx('block truncate text-sm font-semibold leading-tight', isCur ? 'text-sun' : 'text-chalk')}>{tag ? `${tag}: ` : ''}{name}</span>
              <span className={cx('block text-xs', e.skipped ? 'text-flare' : done(i) ? 'text-tide' : 'text-haze')}>{status}</span>
            </span>
          </button>
        );
      })}
      {menu != null && <ExerciseActions index={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function SessionHeader() {
  const { data, update, go } = useStore();
  const s = data.active!;
  const [list, setList] = useState(false);
  const cancel = () => {
    const msg = s.editingId ? 'Discard your edits? The saved workout stays as it was.' : 'Discard this workout? Nothing from it will be saved.';
    if (confirm(msg)) { update((d) => ({ ...d, active: null })); if (s.editingId) go('train'); }
  };
  const done = (i: number) => { const e = s.workout.exercises[i]; return !e.skipped && (e.sets.length > 0 || e.cardio?.completed || e.interval?.completed); };
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-rim bg-ink/95 px-4 pb-2 pt-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm text-haze">
          {s.editingId ? <span className="text-sun">Editing {fmtLong(s.workout.date)} · </span> : s.backfill ? <span className="text-sun">Logging {fmtLong(s.workout.date)} · </span> : null}
          {s.workout.title}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {s.phase !== 'pre' && <WorkoutClock />}
          {s.phase !== 'pre' && <button onClick={() => setList(true)} aria-label="All exercises in this workout" className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><ListOrdered size={20} /></button>}
          <button onClick={cancel} aria-label={s.editingId ? 'Discard edits' : 'Discard workout'} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
      </div>
      <ExerciseStrip />
      {list && createPortal(<SessionOverview onClose={() => setList(false)} />, document.body)}
    </div>
  );
}

function PreCheck() {
  const { data, update } = useStore();
  const s = data.active!;
  const begin = (v: { mood: number | null; energy: number | null; stress: number | null; motivation: number | null; note: string } | null) =>
    update((d) => {
      const a = d.active!;
      if (v) {
        const c = newCheckIn({ context: 'pre', workoutId: a.workout.id, mood: v.mood, energy: v.energy, stress: v.stress, motivation: v.motivation, note: v.note || undefined, ...(a.backfill ? backfillStamp(a.workout.date) : {}) });
        d.checkIns.push(c);
        a.workout.preCheckInId = c.id;
      }
      if (!a.backfill) { a.workout.startedAt = new Date().toISOString(); a.pausedAt = null; a.pausedMs = 0; }
      a.phase = 'exercise';
      return d;
    });
  return (
    <CheckInForm question={s.backfill ? 'How were you feeling before it?' : undefined} fields={['energy', 'stress', 'motivation']}
      submitLabel={s.backfill ? 'Log exercises' : 'Start workout'} onSubmit={begin} onSkip={() => begin(null)}>
      {(v) => {
        const low = (v.mood != null && v.mood <= 4) || (v.energy != null && v.energy <= 2) || (v.stress != null && v.stress >= 4);
        if (s.workout.template === 'quick') return <p className="text-sm text-haze">15-minute reset: leg press, chest press, row, plank.</p>;
        if (s.workout.template === 'custom') return (
          <p className="text-sm text-haze">{s.workout.exercises.length} exercises{s.workout.plannedMin ? `, about ${s.workout.plannedMin} minutes of training` : ''}.{low ? ' Heavier day? Lighten the weights or drop a set; showing up is the win.' : ''}</p>
        );
        return low ? (
          <Panel tone="tide">
            <p>Sounds like a heavier day. A 15-minute session still counts.</p>
            <Btn variant="tide" className="mt-3" onClick={() => update((d) => { const date = d.active?.workout.date; return startSession(d, 'quick', date); })}>Switch to 15 minutes</Btn>
          </Panel>
        ) : <p className="text-sm text-haze">Warm up first: 5 easy minutes on the treadmill is built into this session.</p>;
      }}
    </CheckInForm>
  );
}

function RestTimer({ endsAt, onDone, onAdd }: { endsAt: number; onDone: () => void; onAdd: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => { if (left === 0) onDone(); }, [left, onDone]);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-tide/15 p-4" role="timer" aria-live="polite">
      <div>
        <p className="text-sm text-tide">Rest</p>
        <p className="font-display text-5xl font-semibold leading-none text-tide">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
      </div>
      <div className="flex gap-2">
        <Btn variant="ghost" onClick={onAdd}>+15s</Btn>
        <Btn variant="tide" onClick={onDone}>Skip rest</Btn>
      </div>
    </div>
  );
}

const DIFF: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }, { value: 'failed', label: 'Couldn’t finish' },
];

function ExerciseStep() {
  const { data, update } = useStore();
  const s = data.active!;
  const ex = s.workout.exercises[s.index];
  const def = EXERCISES[ex.exerciseId];
  const rec = useMemo(() => recommend(ex.exerciseId, data), [ex.exerciseId, data.workouts, data.settings]);
  // Later than usual in the workout (moved, out of order, long session)? Start a bit lighter so reps stay clean.
  const fat = useMemo(() => liveFatigue(data, s.index), [data.workouts, s.index, ex.exerciseId, ex.movedLater, ex.sets.length === 0]);
  const stepW = Math.abs(def.increment[rec.unit]) || 2.5;
  const canShave = fat && def.kind === 'strength' && !def.bodyweight && rec.low != null;
  const startW = canShave ? lighter(rec.low!, fat!.pct, stepW) : rec.low;
  const prev = useMemo(() => lastLogFor(ex.exerciseId, data.workouts), [ex.exerciseId, data.workouts]);
  const lastSet = ex.sets[ex.sets.length - 1];
  const targetSets = ex.targetSets ?? def.targetSets;

  const [weight, setWeight] = useState<number | null>(lastSet?.weight ?? startW);
  const [unit, setUnit] = useState<WeightUnit>(lastSet?.unit ?? rec.unit);
  const [reps, setReps] = useState<number | null>(def.repRange?.[0] ?? null);
  const [holdTarget, setHoldTarget] = useState<number>(rec.seconds ?? def.targetSec ?? 30);
  const [secs, setSecs] = useState<number | null>(rec.seconds ?? def.targetSec ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [tip, setTip] = useState<{ text: string; suggest: number | null } | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [cardio, setCardio] = useState({ speed: ex.cardio ? ex.cardio.speedMph : def.speedIncline ? (ex.role === 'warmup' ? 3.0 : 3.3) : null as number | null, incline: ex.cardio ? ex.cardio.inclinePct : def.speedIncline ? 1.5 : null as number | null, minutes: (ex.cardio?.durationMin ?? ex.targetMinutes ?? def.defaultMinutes ?? (ex.role === 'warmup' ? 5 : 8)) as number | null });
  const [effort, setEffort] = useState<Difficulty | null>(ex.cardio?.effort ?? null);

  const pref = data.settings.equipment[ex.exerciseId];
  const unitConfirmed = unit === 'machine' ? (pref?.unit === 'machine' ? pref.confirmed : false) : true;

  const advance = () => update((d) => {
    const a = d.active!;
    a.restEndsAt = null;
    if (a.index < a.workout.exercises.length - 1) a.index++;
    else a.phase = 'post';
    return d;
  });

  const completeSet = () => {
    const set: SetLog = {
      id: uid(), weight: def.kind === 'strength' && !def.bodyweight ? weight : null, unit, unitConfirmed,
      reps: def.kind === 'strength' ? reps : null, durationSec: def.kind === 'timed' ? secs : null,
      difficulty, completed: true,
    };
    update((d) => {
      const a = d.active!;
      const cur = a.workout.exercises[a.index];
      if (!cur.sets.length) { // snapshot how tired you were when this exercise started
        cur.setsBefore = setsBeforeNow(a.workout, a.index);
        const typ = typicalSetsBefore(cur.exerciseId, d.workouts, a.editingId);
        cur.lateBy = typ != null && cur.setsBefore - typ >= 4 ? cur.setsBefore - typ : undefined;
      }
      a.workout.exercises[a.index].sets.push(set);
      a.workout.exercises[a.index].skipped = false;
      a.restEndsAt = a.backfill ? null : Date.now() + (def.restSec || d.settings.restSec) * 1000;
      return d;
    });
    setTip(nextSetTip(ex.exerciseId, set));
    setDifficulty(null);
    if (def.kind === 'timed') setSecs(holdTarget); // next set starts from the chosen target again
  };

  const back = () => update((d) => goToExercise(d, d.active!.index - 1));
  const editSet = (i: number, patch: Partial<SetLog> | null) => update((d) => {
    const e = d.active!.workout.exercises[d.active!.index];
    if (patch === null) e.sets.splice(i, 1); else Object.assign(e.sets[i], patch);
    return d;
  });
  const undo = () => update((d) => { d.active!.workout.exercises[d.active!.index].sets.pop(); d.active!.restEndsAt = null; return d; });

  const skip = () => update((d) => {
    const a = d.active!;
    a.workout.exercises[a.index].skipped = true;
    a.restEndsAt = null;
    if (a.index < a.workout.exercises.length - 1) a.index++; else a.phase = 'post';
    return d;
  });

  const substitute = (id: string) => update((d) => {
    const e = d.active!.workout.exercises[d.active!.index];
    e.substitutedFor = e.substitutedFor ?? e.exerciseId;
    e.exerciseId = id; e.sets = []; e.targetSets = e.targetSets ?? EXERCISES[id].targetSets;
    return d;
  });

  const logCardio = () => {
    update((d) => {
      const e = d.active!.workout.exercises[d.active!.index];
      e.skipped = false;
      e.cardio = { speedMph: def.speedIncline ? cardio.speed : null, inclinePct: def.speedIncline ? cardio.incline : null, durationMin: cardio.minutes, completed: true, effort };
      return d;
    });
    advance();
  };

  const prevSummary = prev ? summarizeWorkout({ ...prev.workout, exercises: [prev.log], dataNotes: [] }).split('\n').slice(1).join(' ').replace(/^• [^:]+: /, '') : null;
  const isLast = s.index === s.workout.exercises.length - 1;
  const setsDone = ex.sets.length >= targetSets;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-haze">
          {ex.role === 'warmup' ? 'Warm-up' : ex.role === 'finisher' ? 'Finisher' : `Exercise ${s.index + 1} of ${s.workout.exercises.length}`}
          {ex.substitutedFor && ` · swapped for ${EXERCISES[ex.substitutedFor].name}`}
        </p>
        <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight">{def.name}</h1>
        {ex.hint && <p className="mt-2 rounded-xl bg-sun/10 p-3 text-sun">{ex.hint}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {def.kind === 'strength' && <Badge tone="sun">{targetSets} × {def.repRange?.join('–')}</Badge>}
          {def.kind === 'timed' && <Badge tone="sun">{targetSets} × {holdTarget} sec{def.unilateral ? ' per side' : ''}</Badge>}
          {def.kind !== 'cardio' && <span className="text-sm text-haze">Set {Math.min(ex.sets.length + 1, targetSets)} of {targetSets}</span>}
        </div>
      </div>

      {ex.skipped && (
        <div className="rounded-2xl border border-flare/40 bg-flare/10 p-3 text-sm">
          You skipped this one. Log it now and it counts. Or move on, and it stays skipped.
        </div>
      )}

      {def.kind !== 'cardio' && (
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-haze">Suggested</p>
              <p className="font-display text-2xl font-semibold">{fmtRec(rec, def.perHand)}</p>
            </div>
            {rec.source === 'provisional' && <Badge>Provisional</Badge>}
          </div>
          <p className="mt-1 text-sm text-haze">{rec.reason}</p>
          {fat && (
            <div className="mt-3 rounded-xl border border-tide/40 bg-tide/10 p-3 text-sm">
              <p className="font-semibold text-tide">{ex.movedLater ? 'Moved later, so you’re more tired' : 'Later in the workout than usual'}</p>
              <p className="mt-1">You’ve done {fat.now} working sets already; {usualPhrase(fat.typical)}.
                {canShave ? ` Starting about ${Math.round(fat.pct * 100)}% lighter (${startW} ${unitLabel(rec.unit)}${def.perHand ? ' each' : ''}) keeps your reps clean.` : ' Expect it to feel harder than usual.'}
                {' '}A lighter or tougher set today won’t lower next week’s suggestion.</p>
            </div>
          )}
          {prevSummary && <p className="mt-3 border-t border-rim pt-3 text-sm"><span className="text-haze">Last time: </span>{prevSummary}</p>}
        </Panel>
      )}

      <div className="flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={() => setShowTips((x) => !x)} aria-expanded={showTips}><BookOpen size={18} /><span className="whitespace-nowrap">Tips</span></Btn>
        {def.substitutes.length > 0 && <Btn variant="ghost" className="flex-1" onClick={() => setShowSubs((x) => !x)} aria-expanded={showSubs}><Shuffle size={18} /><span className="whitespace-nowrap">Swap</span></Btn>}
        <Btn variant="ghost" onClick={skip} aria-label="Skip exercise"><SkipForward size={18} /></Btn>
      </div>
      {showTips && (
        <Panel>
          <ExercisePhotos def={def} className="mb-3" />
          <ExerciseSteps def={def} />
          <a className="mt-3 inline-block text-sm font-semibold text-sun underline underline-offset-4" target="_blank" rel="noreferrer"
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(def.name + ' proper form')}`}>Watch a demo on YouTube</a>
        </Panel>
      )}
      {showSubs && (
        <Panel>
          <p className="mb-2 text-sm text-haze">Machine taken or something doesn’t feel right? Swap to:</p>
          <div className="flex flex-wrap gap-2">
            {def.substitutes.map((id) => <Btn key={id} variant="ghost" onClick={() => { substitute(id); setShowSubs(false); }}>{EXERCISES[id].name}</Btn>)}
          </div>
        </Panel>
      )}

      {def.kind === 'cardio' ? (
        <Panel>
          <div className="space-y-5">
            {def.speedIncline && <Stepper label="Speed" suffix="mph" step={0.1} value={cardio.speed} onChange={(v) => setCardio((c) => ({ ...c, speed: v }))} />}
            {def.speedIncline && <Stepper label="Incline" suffix="%" step={0.5} value={cardio.incline} onChange={(v) => setCardio((c) => ({ ...c, incline: v }))} />}
            <Stepper label="Duration" suffix="minutes" step={def.parts.includes('sports') ? 5 : 1} decimals={false} value={cardio.minutes} onChange={(v) => setCardio((c) => ({ ...c, minutes: v }))} />
            {ex.role !== 'warmup' && (
              <div>
                <p className="mb-2 text-sm text-haze">How hard was it?</p>
                <Chips options={DIFF.slice(0, 3)} value={effort} onChange={setEffort} />
              </div>
            )}
          </div>
          {s.index > 0 && <Btn variant="ghost" className="mt-5 w-full" onClick={back}><ChevronLeft size={18} />Previous exercise</Btn>}
          <Btn size="lg" className="mt-2 w-full" onClick={logCardio}><Check size={20} />Log {ex.role === 'warmup' ? 'warm-up' : def.parts.includes('sports') ? 'activity' : 'cardio'}</Btn>
        </Panel>
      ) : (
        <>
          {s.restEndsAt && (
            <RestTimer endsAt={s.restEndsAt}
              onDone={() => update((d) => { if (d.active) d.active.restEndsAt = null; return d; })}
              onAdd={() => update((d) => { if (d.active?.restEndsAt) d.active.restEndsAt += 15000; return d; })} />
          )}
          {tip && (
            <div className="rounded-2xl border border-sun/40 p-4">
              <p>{tip.text}</p>
              {tip.suggest != null && <Btn variant="ghost" className="mt-3" onClick={() => { setWeight(tip.suggest); setTip(null); }}>Use {tip.suggest} {unitLabel(unit)}</Btn>}
            </div>
          )}

          <Panel>
            <div className="space-y-5">
              {def.kind === 'strength' && !def.bodyweight && (
                <div>
                  <Stepper label={`Weight${def.perHand ? ' per hand' : ''}`} suffix={unitLabel(unit)} step={Math.abs(def.increment[unit]) || 2.5} value={weight} onChange={setWeight} />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(['lb', 'kg', 'machine'] as WeightUnit[]).map((u) => (
                      <button key={u} onClick={() => setUnit(u)} aria-pressed={unit === u}
                        className={cx('min-h-[36px] rounded-lg border px-3 text-sm', unit === u ? 'border-chalk text-chalk' : 'border-rim text-haze')}>{u === 'machine' ? 'machine units' : u}</button>
                    ))}
                    {unit === 'machine' && !unitConfirmed && <Badge tone="flare">Unit unverified</Badge>}
                  </div>
                </div>
              )}
              {def.kind === 'strength' && <Stepper label="Reps" step={1} decimals={false} value={reps} onChange={setReps} />}
              {def.kind === 'timed' && (s.backfill
                ? <Stepper label={`Held${def.unilateral ? ' per side' : ''}`} suffix="seconds" step={5} decimals={false} value={secs} onChange={setSecs} />
                : <HoldTimer key={ex.sets.length} target={holdTarget} perSide={def.unilateral}
                    onTarget={(t) => { setHoldTarget(t); setSecs(t); }} onHeld={setSecs} />)}
              <div>
                <p className="mb-2 text-sm text-haze">How did that set feel?</p>
                <Chips options={DIFF} value={difficulty} onChange={setDifficulty} />
              </div>
            </div>
            <Btn size="lg" className="mt-5 w-full" onClick={completeSet}><Check size={20} />Complete set {ex.sets.length + 1}</Btn>
          </Panel>

          {ex.sets.length > 0 && (
            <Panel>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-haze">Logged</p>
                <span className="text-xs text-haze">Tap a set to fix it</span>
              </div>
              <ol className="divide-y divide-rim">
                {ex.sets.map((st, i) => <SetRow key={st.id} n={i + 1} set={st} kind={def.kind} perHand={def.perHand} onChange={(p) => editSet(i, p)} />)}
              </ol>
            </Panel>
          )}
        </>
      )}

      {def.kind !== 'cardio' && (
        <div className="flex gap-2">
          {s.index > 0 && <Btn size="lg" variant="ghost" aria-label="Previous exercise" onClick={back}><ChevronLeft size={20} /></Btn>}
          <Btn size="lg" variant={setsDone ? 'primary' : 'ghost'} className="flex-1" onClick={advance}>
            {isLast ? (s.editingId ? 'Review & save' : 'Finish workout') : setsDone ? 'Next exercise' : 'Move on'}<ChevronRight size={20} />
          </Btn>
        </div>
      )}
      {!isLast && (
        <button className="mx-auto flex min-h-[44px] items-center gap-1 text-sm text-haze" onClick={() => update((d) => { d.active!.phase = 'post'; d.active!.restEndsAt = null; return d; })}>
          <RotateCcw size={14} />{s.editingId ? 'Done editing: review & save' : 'End early and save what I’ve done'}
        </button>
      )}
    </div>
  );
}

function PostCheck() {
  const { data } = useStore();
  return data.active!.editingId ? <EditSave /> : <PostCheckNew />;
}

/** Saving an edited workout: replaces the original, keeps its id, and updates mood. */
function EditSave() {
  const { data, update, setFinishedId, go } = useStore();
  const a = data.active!;
  const w = a.workout;
  const pre = data.checkIns.find((c) => c.id === w.preCheckInId);
  const post = data.checkIns.find((c) => c.id === w.postCheckInId);
  const [minutes, setMinutes] = useState<number | null>(w.durationMin);
  const [moodBefore, setMoodBefore] = useState<number | null>(pre?.mood ?? null);
  const [moodAfter, setMoodAfter] = useState<number | null>(post?.mood ?? null);
  const [date, setDate] = useState(w.date);
  const skipped = w.exercises.filter((e) => e.skipped).length;
  const empty = w.exercises.filter((e) => !e.skipped && !e.sets.length && !e.cardio?.completed && !e.interval?.completed).length;

  const save = () => {
    const id = w.id;
    update((d) => {
      const edited = d.active!.workout;
      edited.durationMin = minutes;
      edited.date = date;
      edited.exercises = edited.exercises.filter((e) => e.skipped || e.sets.length || e.cardio || e.interval?.completed);
      const upsertMood = (cid: string | undefined, context: 'pre' | 'post', mood: number | null) => {
        const existing = cid ? d.checkIns.find((c) => c.id === cid) : undefined;
        if (existing) { existing.mood = mood; existing.date = date; return existing.id; }
        if (mood == null) return cid;
        const c = newCheckIn({ context, workoutId: id, mood, ...backfillStamp(date) });
        d.checkIns.push(c); return c.id;
      };
      edited.preCheckInId = upsertMood(edited.preCheckInId, 'pre', moodBefore);
      edited.postCheckInId = upsertMood(edited.postCheckInId, 'post', moodAfter);
      d.workouts = d.workouts.map((x) => (x.id === id ? edited : x));
      d.active = null;
      return d;
    });
    setFinishedId(id);
    go('train');
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl font-bold leading-tight">Save your changes</h1>
      {(skipped > 0 || empty > 0) && (
        <p className="rounded-2xl border border-flare/40 bg-flare/10 p-3 text-sm">
          {skipped > 0 && `${skipped} exercise${skipped > 1 ? 's are' : ' is'} still marked skipped. `}
          {empty > 0 && `${empty} with nothing logged will be removed. `}
          Use the list button at the top to go back to any of them.
        </p>
      )}
      <Panel>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-haze">Date</span>
          <input type="date" value={date} max={toISO(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Workout date"
            className="min-h-[44px] rounded-xl border border-rim bg-ink px-3 text-chalk [color-scheme:dark]" />
        </label>
        <div className="mt-4"><Stepper label="Duration" suffix="minutes" step={5} decimals={false} value={minutes} onChange={setMinutes} /></div>
      </Panel>
      <Panel>
        <div className="space-y-4">
          <Scale label="Mood before (1–10)" value={moodBefore} onChange={setMoodBefore} />
          <Scale label="Mood after (1–10)" value={moodAfter} onChange={setMoodAfter} />
        </div>
      </Panel>
      <Btn size="lg" className="w-full" onClick={save}><Check size={20} />Save changes</Btn>
      <Btn variant="ghost" className="w-full" onClick={() => update((d) => goToExercise(d, d.active!.index))}><ChevronLeft size={18} />Back to exercises</Btn>
    </div>
  );
}

function PostCheckNew() {
  const { data, update, setFinishedId } = useStore();
  const a = data.active!;
  const id = a.workout.id;
  const [minutes, setMinutes] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      {a.backfill ? (
        <Panel>
          <Stepper label="How long did it take?" suffix="minutes" step={5} decimals={false} value={minutes} onChange={setMinutes} />
          <p className="mt-2 text-xs text-haze">Leave blank if you don’t remember; it’ll show as “not recorded.” Momentum won’t guess.</p>
        </Panel>
      ) : (
        <>
          {a.workout.startedAt && (
            <div className="flex items-center justify-between rounded-2xl bg-tide/10 p-4">
              <span className="flex items-center gap-2 text-tide"><Timer size={18} />Workout time</span>
              <span className="font-display text-3xl font-semibold tabular-nums text-tide">{clock(elapsedMs(a))}</span>
            </div>
          )}
          <p className="text-haze">Cool down with a few minutes of easy walking and some stretching. The clock stops when you save.</p>
        </>
      )}
      <Btn variant="quiet" className="px-0" onClick={() => update((d) => goToExercise(d, d.active!.index))}><ChevronLeft size={16} />Back to exercises</Btn>
      <CheckInForm question={a.backfill ? 'How did you feel after?' : 'How are you feeling now?'} fields={['energy', 'stress', 'fatigue', 'soreness']} submitLabel="Save workout"
        onSubmit={(v) => {
          update((d) => {
            const act = d.active!;
            const w = act.workout;
            const c = newCheckIn({ context: 'post', workoutId: w.id, mood: v.mood, energy: v.energy, stress: v.stress, fatigue: v.fatigue, note: v.note || undefined, ...(act.backfill ? backfillStamp(w.date) : {}) });
            d.checkIns.push(c);
            w.postCheckInId = c.id;
            if (act.backfill) {
              w.durationMin = minutes;
            } else {
              w.endedAt = new Date().toISOString();
              const ms = elapsedMs(act);
              w.activeSec = Math.round(ms / 1000);
              w.durationMin = w.startedAt ? Math.max(1, Math.round(ms / 60000)) : null;
            }
            w.soreness = v.soreness;
            w.exercises = w.exercises.filter((e) => e.skipped || e.sets.length || e.cardio || e.interval?.completed);
            d.workouts.push(w);
            d.active = null;
            return d;
          });
          setFinishedId(id);
        }} />
    </div>
  );
}

function SetRow({ n, set, kind, perHand, onChange }: { n: number; set: SetLog; kind: string; perHand?: boolean; onChange: (p: Partial<SetLog> | null) => void }) {
  const [editing, setEditing] = useState(false);
  const num = (v: string) => (v === '' ? null : Number(v));
  const input = 'min-h-[44px] w-full rounded-lg border border-rim bg-ink px-2 text-center font-display text-xl text-chalk outline-none focus:border-sun';
  if (!editing) {
    return (
      <li>
        <button onClick={() => setEditing(true)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left font-display text-lg active:bg-rim/50">
          <span>Set {n}</span>
          <span className="flex items-center gap-2">
            {kind === 'timed' ? `${set.durationSec ?? '–'} sec` : `${set.weight ?? 'BW'}${set.weight != null ? ' ' + unitLabel(set.unit) : ''}${perHand && set.weight != null ? ' ea' : ''} × ${set.reps ?? '–'}`}
            <span className="font-sans text-sm text-haze">{set.difficulty ? DIFF.find((d) => d.value === set.difficulty)!.label : 'unrated'}</span>
            <Pencil size={14} className="text-haze" />
          </span>
        </button>
      </li>
    );
  }
  return (
    <li className="space-y-2 py-2">
      <p className="text-sm text-haze">Edit set {n}</p>
      <div className="flex gap-2">
        {kind === 'timed' ? (
          <label className="flex-1"><span className="text-xs text-haze">Seconds</span>
            <input inputMode="numeric" type="number" className={input} value={set.durationSec ?? ''} onChange={(e) => onChange({ durationSec: num(e.target.value) })} /></label>
        ) : (
          <>
            <label className="flex-1"><span className="text-xs text-haze">Weight ({unitLabel(set.unit)})</span>
              <input inputMode="decimal" type="number" className={input} value={set.weight ?? ''} onChange={(e) => onChange({ weight: num(e.target.value) })} /></label>
            <label className="flex-1"><span className="text-xs text-haze">Reps</span>
              <input inputMode="numeric" type="number" className={input} value={set.reps ?? ''} onChange={(e) => onChange({ reps: num(e.target.value) })} /></label>
          </>
        )}
      </div>
      <Chips options={DIFF} value={set.difficulty} onChange={(v) => onChange({ difficulty: v })} />
      <div className="flex gap-2">
        <Btn className="flex-1" onClick={() => setEditing(false)}><Check size={16} />Done</Btn>
        <Btn variant="ghost" onClick={() => { if (confirm(`Delete set ${n}?`)) onChange(null); }}><Trash2 size={16} />Delete</Btn>
      </div>
    </li>
  );
}
