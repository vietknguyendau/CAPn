import type { AppData, Difficulty, ExerciseLog, SetLog, WeightUnit, Workout } from '../types';
import { EXERCISES, unitLabel } from '../data/exercises';
import { setsBeforeIn, typicalSetsBefore } from './fatigue';
import { fmtShort } from './date';

export interface Recommendation {
  low: number | null;
  high: number | null;
  unit: WeightUnit;
  unitConfirmed: boolean;
  seconds: number | null;
  reason: string;
  source: 'provisional' | 'history' | 'none';
}

// Provisional starting points from the Nov 2 baseline (not automatic increases).
const PROVISIONAL: Record<string, { low: number | null; high: number | null; unit: WeightUnit; seconds?: number; reason: string }> = {
  'leg-press': { low: 120, high: 140, unit: 'lb', reason: 'Provisional from Nov 2: you moved 140 lb well, but reps weren’t recorded. Find a weight you control for 10–12.' },
  'chest-press': { low: 60, high: 60, unit: 'lb', reason: 'Provisional: 60 lb felt moderate on Nov 2. Hold here and log your reps.' },
  'lat-pulldown': { low: 80, high: 90, unit: 'lb', reason: 'Provisional: 60 lb was too easy and 90 lb was challenging for 12.' },
  'seated-row': { low: 35, high: 35, unit: 'machine', reason: 'Provisional: 35 felt manageable. Machine units are still unverified.' },
  'db-shoulder-press': { low: 25, high: 25, unit: 'lb', reason: 'Provisional: 25 lb per hand for 10 still felt slightly easy. Own it before adding more.' },
  plank: { low: null, high: null, unit: 'lb', seconds: 30, reason: 'Provisional: 2 × 30 seconds. Nov 2 durations weren’t recorded.' },
};

const round = (n: number, step = 2.5) => Math.max(0, Math.round(n / step) * step);

export function lastLogFor(exerciseId: string, workouts: Workout[]): { workout: Workout; log: ExerciseLog } | null {
  const sorted = [...workouts].sort((a, b) => (b.date + (b.endedAt ?? '')).localeCompare(a.date + (a.endedAt ?? '')));
  for (const w of sorted) {
    for (const log of [...w.exercises].reverse()) {
      if (log.exerciseId !== exerciseId || log.skipped) continue;
      if (log.cardio?.completed || log.sets.some((s) => s.completed)) return { workout: w, log };
    }
  }
  return null;
}

/** Every completed log of an exercise, newest first, with its position in that workout. */
function logsFor(exerciseId: string, workouts: Workout[]) {
  const out: { workout: Workout; log: ExerciseLog; i: number }[] = [];
  const sorted = [...workouts].sort((a, b) => (b.date + (b.endedAt ?? '')).localeCompare(a.date + (a.endedAt ?? '')));
  for (const w of sorted) w.exercises.forEach((log, i) => {
    if (log.exerciseId === exerciseId && !log.skipped && log.sets.some((x) => x.completed && x.weight != null)) out.push({ workout: w, log, i });
  });
  return out;
}

export function topSet(sets: SetLog[]): SetLog | null {
  const done = sets.filter((s) => s.completed && s.weight != null);
  if (!done.length) return null;
  return done.reduce((a, b) => ((b.weight ?? 0) >= (a.weight ?? 0) ? b : a));
}

export function recommend(exerciseId: string, data: AppData): Recommendation {
  const def = EXERCISES[exerciseId];
  const pref = data.settings.equipment[exerciseId];
  const unit: WeightUnit = pref?.unit ?? (def.defaultUnit === 'machine' ? 'machine' : data.settings.defaultUnit);
  const unitConfirmed = pref?.confirmed ?? def.defaultUnit !== 'machine';
  const last = lastLogFor(exerciseId, data.workouts);

  if (!last) {
    return { low: null, high: null, unit, unitConfirmed, seconds: def.targetSec ?? null, source: 'none',
      reason: 'No history yet. Pick a weight you can move for every rep with control, then rate it.' };
  }

  if (last.workout.seeded && PROVISIONAL[exerciseId]) {
    const p = PROVISIONAL[exerciseId];
    const pu = pref?.unit ?? p.unit;
    return { low: p.low, high: p.high, unit: pu, unitConfirmed: pu === 'machine' ? (pref?.confirmed ?? false) : true,
      seconds: p.seconds ?? null, reason: p.reason, source: 'provisional' };
  }

  if (def.kind === 'timed') {
    const secs = last.log.sets.filter((s) => s.completed && s.durationSec).map((s) => s.durationSec as number);
    const best = secs.length ? Math.max(...secs) : null;
    const easy = last.log.sets.some((s) => s.difficulty === 'easy');
    const hard = last.log.sets.some((s) => s.difficulty === 'hard' || s.difficulty === 'failed');
    const seconds = best == null ? def.targetSec ?? 30 : easy ? best + 10 : hard ? Math.max(15, best - 5) : best;
    return { low: null, high: null, unit, unitConfirmed, seconds, source: 'history',
      reason: best == null ? 'Last durations weren’t recorded. Start at the target.' : `Last best hold: ${best} sec.` };
  }

  // If the last time was done much later than usual (tired) and went worse, don't treat it as a step back:
  // base the suggestion on the most recent normal session instead.
  const logs = logsFor(exerciseId, data.workouts);
  let use = last;
  let note = '';
  if (logs.length >= 2) {
    const [l0, l1] = logs;
    const before = setsBeforeIn(l0.workout, l0.i);
    const typical = typicalSetsBefore(exerciseId, data.workouts.filter((w) => w.id !== l0.workout.id));
    const t0 = topSet(l0.log.sets), t1 = topSet(l1.log.sets);
    const worse = !!t0 && !!t1 && ((t0.weight ?? 0) < (t1.weight ?? 0) || t0.difficulty === 'hard' || t0.difficulty === 'failed' ||
      (t0.reps != null && t0.reps < (def.repRange?.[0] ?? 8)));
    if (typical != null && (before - typical >= 4 || (l0.log.movedLater && before - typical >= 2)) && worse) {
      use = { workout: l1.workout, log: l1.log };
      note = `On ${fmtShort(l0.workout.date)} you did this late, after ${before} sets (${typical <= 1 ? 'you usually do it first' : `usually about ${typical}`}), so that session doesn’t count as a step back. Based on ${fmtShort(l1.workout.date)}: `;
    }
  }

  const top = topSet(use.log.sets);
  if (!top || top.weight == null) {
    return { low: null, high: null, unit, unitConfirmed, seconds: null, source: 'none', reason: 'Last session had no weights logged.' };
  }
  const w = top.weight;
  const step = Math.abs(def.increment[top.unit]) || 2.5;
  const min = def.repRange?.[0] ?? 8;
  const short = top.reps != null && top.reps < min;
  const u = unitLabel(top.unit);
  const base = { unit: top.unit, unitConfirmed: top.unitConfirmed, seconds: null, source: 'history' as const };
  const r = (low: number, high: number, reason: string): Recommendation => ({ ...base, low, high, reason: note + reason });

  if (top.difficulty === 'failed' || short) return r(round(w - step), w, `Last time ${w} ${u} fell short of ${min} reps. Ease back and rebuild.`);
  switch (top.difficulty) {
    case 'easy': return r(round(w + step), round(w + step), `${w} ${u} felt easy at full reps. A small bump is earned, if your form stays controlled.`);
    case 'moderate': return r(w, round(w + step), `${w} ${u} felt moderate. Repeat it, or nudge up if every rep is clean.`);
    case 'hard': return r(round(w - step), w, `${w} ${u} was hard. Hold here until it feels moderate.`);
    default: return r(w, w, `No difficulty was logged for ${w} ${u}. Repeat it and rate how it feels.`);
  }
}

// In-session advice after a set is completed.
export function nextSetTip(exerciseId: string, set: SetLog): { text: string; suggest: number | null } {
  const def = EXERCISES[exerciseId];
  if (def.kind !== 'strength' || set.weight == null || def.bodyweight) {
    return { text: set.difficulty === 'easy' ? 'Felt easy. Add a few seconds or reps next round.' : 'Logged. Breathe and reset.', suggest: null };
  }
  const step = Math.abs(def.increment[set.unit]) || 2.5;
  const w = set.weight; const u = unitLabel(set.unit);
  const map: Record<Difficulty, { text: string; suggest: number | null }> = {
    easy: { text: `Nice work. Try ${round(w + step)}–${round(w + 2 * step)} ${u} next set if your form was controlled.`, suggest: round(w + step) },
    moderate: { text: `Good set. Stay at ${w} ${u}, or add ${step} if it moved smoothly.`, suggest: null },
    hard: { text: `Solid effort. Stay at ${w} ${u} or drop to ${round(w - step)} to keep form clean.`, suggest: null },
    failed: { text: `No problem. Drop to ${round(w - step)} ${u} and finish strong.`, suggest: round(w - step) },
  };
  return set.difficulty ? map[set.difficulty] : { text: 'Logged. Rate your sets so I can tune next session.', suggest: null };
}

export const fmtRec = (r: Recommendation, perHand?: boolean) => {
  if (r.seconds != null && r.low == null) return `${r.seconds} sec`;
  if (r.low == null) return 'Your choice';
  const u = unitLabel(r.unit);
  const range = r.low === r.high || r.high == null ? `${r.low}` : `${r.low}–${r.high}`;
  return `${range} ${u}${perHand ? ' each' : ''}`;
};

/** Shave a suggestion for fatigue, rounded to the exercise's weight steps. */
export function lighter(w: number, pct: number, step: number) {
  const s = step || 2.5;
  return Math.max(0, Math.min(w - s, Math.round((w * (1 - pct)) / s) * s));
}
