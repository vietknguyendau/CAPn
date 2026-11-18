import type { Activity, AppData, CheckIn, Settings, Workout } from '../types';
import { addDays, dayIdx, parseISO, toISO, todayISO, toMinutes, weekStart } from './date';
import { EXERCISES, unitLabel } from '../data/exercises';
import { topSet } from './progression';

export const ACTIVITY: Record<Activity, { label: string; detail: string }> = {
  strength: { label: 'Full-body strength', detail: 'About 45–50 minutes, or the 15-minute version.' },
  walk: { label: 'Walking and recovery', detail: '20–30 minutes of easy walking. Loosen up, no pressure.' },
  light: { label: 'Light cardio or rest', detail: 'Easy cardio if you feel like it. Rest counts too.' },
  recreation: { label: 'Recreational activity', detail: 'Something you enjoy. Movement for fun.' },
  recovery: { label: 'Recovery', detail: 'Stretch, sleep, eat well. Recovery is part of training.' },
  rest: { label: 'Rest', detail: 'Take the day.' },
};

export { planFor } from './plan';
import { planFor, isWorkout } from './plan';

export const workoutsOn = (iso: string, ws: Workout[]) => ws.filter((w) => w.date === iso);

export function weekSummary(data: AppData, ref = new Date()) {
  const start = weekStart(ref);
  const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(start, i)));
  const ws = data.workouts.filter((w) => days.includes(w.date));
  const planned = days.filter((d) => isWorkout(planFor(d, data.settings))).length || 3;
  const minutes = ws.reduce((a, w) => a + (w.durationMin ?? 0), 0);
  const minutesUnknown = ws.filter((w) => w.durationMin == null).length;
  return {
    days, done: ws.length, planned,
    consistency: Math.min(100, Math.round((ws.length / planned) * 100)),
    minutes, minutesUnknown,
  };
}

// Weeks in a row with at least one workout. The current week doesn't break the streak while it's in progress.
export function weeklyStreak(workouts: Workout[], ref = new Date()) {
  const has = (start: Date) => {
    const s = toISO(start), e = toISO(addDays(start, 6));
    return workouts.some((w) => w.date >= s && w.date <= e);
  };
  let start = weekStart(ref);
  let streak = has(start) ? 1 : 0;
  start = addDays(start, -7);
  while (has(start)) { streak++; start = addDays(start, -7); }
  return streak;
}

export function moodPairs(data: AppData) {
  const byId = new Map(data.checkIns.map((c) => [c.id, c] as [string, CheckIn]));
  return [...data.workouts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({
      date: w.date,
      pre: w.preCheckInId ? byId.get(w.preCheckInId)?.mood ?? null : null,
      post: w.postCheckInId ? byId.get(w.postCheckInId)?.mood ?? null : null,
    }));
}

export function avgPostMood(data: AppData) {
  const v = moodPairs(data).map((p) => p.post).filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

export function strengthSeries(exerciseId: string, workouts: Workout[]) {
  return [...workouts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((w) => {
      const log = w.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped);
      const t = log ? topSet(log.sets) : null;
      return t && t.weight != null ? [{ date: w.date, weight: t.weight, unit: t.unit, confirmed: t.unitConfirmed, reps: t.reps }] : [];
    });
}

export function personalRecords(workouts: Workout[]) {
  const best: Record<string, { weight: number; unit: string; date: string; reps: number | null; confirmed: boolean }> = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const def = EXERCISES[ex.exerciseId];
    if (!def || def.kind !== 'strength') continue;
    for (const s of ex.sets) {
      if (!s.completed || s.weight == null) continue;
      const cur = best[ex.exerciseId];
      if (!cur || s.weight > cur.weight) best[ex.exerciseId] = { weight: s.weight, unit: unitLabel(s.unit), date: w.date, reps: s.reps, confirmed: s.unitConfirmed };
    }
  }
  return best;
}

export function windowStatus(s: Settings, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const current = s.windows.find((w) => mins >= toMinutes(w.start) && mins < toMinutes(w.end));
  const next = s.windows.find((w) => mins < toMinutes(w.start));
  return { current: current ?? null, next: next ?? null, allPassed: !current && !next };
}

export function nextPlanned(data: AppData, fromISO = todayISO()) {
  const from = parseISO(fromISO);
  for (let i = 1; i <= 7; i++) {
    const iso = toISO(addDays(from, i));
    return { iso, plan: planFor(iso, data.settings) };
  }
  return null;
}

export function nextStrength(data: AppData, fromISO = todayISO()) {
  const from = parseISO(fromISO);
  for (let i = 1; i <= 7; i++) {
    const iso = toISO(addDays(from, i));
    if (isWorkout(planFor(iso, data.settings))) return iso;
  }
  return null;
}
