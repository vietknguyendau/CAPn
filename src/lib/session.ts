import type { AppData, BuilderDraft, CheckIn, TemplateId, Workout } from '../types';
import { EXERCISES, TEMPLATES, type TemplateItem } from '../data/exercises';
import { programItems, type Program } from '../data/programs';
import { todayISO, uid } from './date';
import { estimate } from './estimate';

function build(items: TemplateItem[], title: string, template: Workout['template'], cooldown: boolean, date = todayISO()): Workout {
  return {
    id: uid(), date, startedAt: null, endedAt: null, durationMin: null,
    template, title, soreness: null,
    plannedMin: estimate(items, { warmup: false, cooldown }).training,
    exercises: items.map((i) => ({
      id: uid(), exerciseId: i.exerciseId, role: i.role, sets: [],
      targetSets: i.sets ?? EXERCISES[i.exerciseId].targetSets,
      targetMinutes: i.minutes,
      ...(i.hint ? { hint: i.hint } : {}),
      ...(i.interval ? { interval: { ...i.interval, roundsDone: null, effort: null, completed: false } } : {}),
    })),
  };
}

export const buildWorkout = (t: TemplateId, date?: string) => build(TEMPLATES[t].items, TEMPLATES[t].title, t, TEMPLATES[t].cooldown, date);

export function draftToItems(d: BuilderDraft): TemplateItem[] {
  const items: TemplateItem[] = d.items.map((i) => ({ exerciseId: i.exerciseId, role: 'main', sets: i.sets, minutes: i.minutes }));
  return d.warmup ? [{ exerciseId: 'treadmill', role: 'warmup', minutes: 5 }, ...items] : items;
}

export function startSession(d: AppData, template: TemplateId, date?: string): AppData {
  const backfill = !!date && date !== todayISO();
  d.active = { workout: buildWorkout(template, date), index: 0, phase: 'pre', restEndsAt: null, backfill };
  return d;
}

export function startCustom(d: AppData, draft: BuilderDraft, title = 'Custom workout', date?: string): AppData {
  const backfill = !!date && date !== todayISO();
  d.active = { workout: build(draftToItems(draft), title, 'custom', draft.cooldown, date), index: 0, phase: 'pre', restEndsAt: null, backfill };
  return d;
}

export function newCheckIn(p: Partial<CheckIn> & Pick<CheckIn, 'context'>): CheckIn {
  return {
    id: uid(), createdAt: new Date().toISOString(), date: todayISO(),
    mood: null, energy: null, stress: null, motivation: null, fatigue: null, ...p,
  };
}

/** Check-in timestamps for a backfilled day: noon local on that date, so trends land on the right day. */
export const backfillStamp = (date: string) => ({ date, createdAt: `${date}T12:00:00` });

export function startProgram(d: AppData, p: Program, date?: string): AppData {
  const backfill = !!date && date !== todayISO();
  d.active = { workout: build(programItems(p), p.name, 'custom', p.cooldown, date), index: 0, phase: 'pre', restEndsAt: null, backfill };
  return d;
}

/** Re-open a saved workout in the session screens to fix sets, un-skip or add exercises. */
export function openForEdit(d: AppData, workoutId: string): AppData {
  const w = d.workouts.find((x) => x.id === workoutId);
  if (!w) return d;
  d.active = { workout: structuredClone(w), index: 0, phase: 'exercise', restEndsAt: null, backfill: true, editingId: w.id };
  return d;
}

/** Jump to any exercise in the current session. */
export function goToExercise(d: AppData, i: number): AppData {
  if (!d.active) return d;
  d.active.index = Math.max(0, Math.min(i, d.active.workout.exercises.length - 1));
  d.active.phase = 'exercise';
  d.active.restEndsAt = null;
  return d;
}

export function addExerciseToSession(d: AppData, exerciseId: string): AppData {
  const a = d.active; if (!a) return d;
  const def = EXERCISES[exerciseId];
  a.workout.exercises.push({ id: uid(), exerciseId, role: 'main', sets: [], targetSets: def.targetSets, targetMinutes: def.kind === 'cardio' ? def.defaultMinutes ?? 10 : undefined });
  return goToExercise(d, a.workout.exercises.length - 1);
}

/** A fresh copy of a past workout's exercises, same order and set counts, ready to start. */
export function startRepeat(d: AppData, w: Workout, date?: string): AppData {
  const items: TemplateItem[] = w.exercises.filter((e) => EXERCISES[e.exerciseId] || e.interval).map((e) => ({
    exerciseId: e.exerciseId, role: e.role,
    sets: Math.max(e.sets.length, e.targetSets ?? 0) || undefined, // the planned count, or more if you did extra
    minutes: e.cardio?.durationMin ?? e.targetMinutes,
    hint: e.hint,
    interval: e.interval ? (({ roundsDone, effort, completed, note, ...spec }) => spec)(e.interval) : undefined,
  }));
  const backfill = !!date && date !== todayISO();
  d.active = { workout: build(items, w.title, 'custom', true, date), index: 0, phase: 'pre', restEndsAt: null, backfill };
  return d;
}

export const AUTO_FINISH_MS = 20 * 60 * 1000;
const hasLogged = (w: Workout) => w.exercises.some((e) => e.sets.length || e.cardio?.completed || e.interval?.completed);

/**
 * If a live workout has had no activity for 20 minutes, save it as finished at the time of
 * the last activity. Returns the saved workout id, or null if nothing was done.
 * Skips: logging a past day, editing a saved workout, a paused clock, or nothing logged yet.
 */
export function autoFinish(d: AppData, now = Date.now()): string | null {
  const a = d.active;
  if (!a || a.backfill || a.editingId || !a.workout.startedAt || a.pausedAt != null) return null;
  const last = a.lastActivityAt ?? Date.parse(a.workout.startedAt);
  if (now - last < AUTO_FINISH_MS || !hasLogged(a.workout)) return null;
  const w = a.workout;
  w.endedAt = new Date(last).toISOString();
  const ms = Math.max(0, last - Date.parse(w.startedAt!) - (a.pausedMs ?? 0));
  w.activeSec = Math.round(ms / 1000);
  w.durationMin = Math.max(1, Math.round(ms / 60000));
  w.autoFinished = true;
  w.exercises = w.exercises.filter((e) => e.skipped || e.sets.length || e.cardio || e.interval?.completed);
  d.workouts.push(w);
  d.active = null;
  return w.id;
}

// ── Changing the plan mid-workout ──
/** Move exercise `from` to position `to`, keeping you on the same exercise you were on. */
export function moveExercise(d: AppData, from: number, to: number): AppData {
  const a = d.active; if (!a) return d;
  const list = a.workout.exercises;
  if (from === to || from < 0 || from >= list.length) return d;
  const currentId = list[a.index]?.id;
  const [x] = list.splice(from, 1);
  if (to > from && !x.sets.length) x.movedLater = true;
  list.splice(Math.max(0, Math.min(to, list.length)), 0, x);
  a.index = Math.max(0, list.findIndex((e) => e.id === currentId));
  return d;
}

/** Swap exercise i for a different one. Logged sets are cleared; the set count is kept. */
export function replaceExercise(d: AppData, i: number, exerciseId: string): AppData {
  const e = d.active?.workout.exercises[i]; if (!e) return d;
  const def = EXERCISES[exerciseId];
  e.substitutedFor = e.substitutedFor ?? e.exerciseId;
  e.exerciseId = exerciseId; e.sets = []; e.cardio = undefined; e.skipped = false; e.hint = undefined;
  e.targetMinutes = def.kind === 'cardio' ? e.targetMinutes ?? def.defaultMinutes ?? 10 : undefined;
  e.targetSets = def.kind === 'cardio' ? 1 : e.targetSets ?? def.targetSets;
  return d;
}

export function removeExercise(d: AppData, i: number): AppData {
  const a = d.active; if (!a || a.workout.exercises.length <= 1) return d;
  const list = a.workout.exercises;
  const currentId = list[a.index]?.id;
  list.splice(i, 1);
  const k = list.findIndex((e) => e.id === currentId);
  a.index = k >= 0 ? k : Math.min(i, list.length - 1);
  a.restEndsAt = null;
  return d;
}

export function setTargetSets(d: AppData, i: number, n: number): AppData {
  const e = d.active?.workout.exercises[i]; if (e) e.targetSets = Math.max(1, Math.min(8, n));
  return d;
}
