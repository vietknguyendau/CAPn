// Accounts for fatigue when an exercise is done later in a workout than usual.
// "How tired" = working sets already completed before the exercise starts.
import type { AppData, ExerciseLog, Workout } from '../types';
import { EXERCISES } from '../data/exercises';

const working = (e: ExerciseLog) => {
  const def = EXERCISES[e.exerciseId];
  if (e.interval?.completed) return 3; // a timed block tires you about as much as a few sets
  if (!def || def.kind === 'cardio' || e.role === 'warmup') return 0;
  return e.sets.filter((s) => s.completed).length;
};

/** Working sets done before exercise i: recorded when it started, otherwise estimated from its position. */
export function setsBeforeIn(w: Workout, i: number): number {
  const e = w.exercises[i];
  if (e.setsBefore != null) return e.setsBefore;
  return w.exercises.slice(0, i).reduce((n, x) => n + working(x), 0);
}

/** Right now, in the live workout: sets done in every other exercise. */
export function setsBeforeNow(w: Workout, i: number): number {
  return w.exercises.reduce((n, x, k) => (k === i ? n : n + working(x)), 0);
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Where this exercise usually falls: median sets-before across past workouts (needs 1+). */
export function typicalSetsBefore(exerciseId: string, workouts: Workout[], excludeId?: string): number | null {
  const v: number[] = [];
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    w.exercises.forEach((e, i) => { if (e.exerciseId === exerciseId && !e.skipped && e.sets.some((s) => s.completed)) v.push(setsBeforeIn(w, i)); });
  }
  return v.length ? Math.round(median(v)) : null;
}

export interface Fatigue { extra: number; pct: number; typical: number; now: number }

/**
 * How much later than usual. 4+ extra sets ≈ two more exercises in your legs → about 5% lighter;
 * 8+ → about 10%. Nothing is assumed without history to compare against.
 */
export function fatigueFor(now: number, typical: number | null, moved = false): Fatigue | null {
  if (typical == null) return null;
  const extra = now - typical;
  if (extra < 4 && !(moved && extra >= 2)) return null;
  return { extra, pct: extra >= 8 ? 0.1 : 0.05, typical, now };
}

export function liveFatigue(d: AppData, i: number): Fatigue | null {
  const a = d.active; if (!a) return null;
  const e = a.workout.exercises[i]; const def = EXERCISES[e.exerciseId];
  if (!def || def.kind === 'cardio' || e.role !== 'main') return null;
  const now = e.sets.length ? e.setsBefore ?? setsBeforeNow(a.workout, i) : setsBeforeNow(a.workout, i);
  return fatigueFor(now, typicalSetsBefore(e.exerciseId, d.workouts, a.editingId), !!e.movedLater);
}

/** "you usually do it first" / "you usually get here after about 6" */
export const usualPhrase = (typical: number) => (typical <= 1 ? 'you usually do it first' : `you usually get here after about ${typical}`);
