import type { AppData } from '../types';
import { EXERCISES } from '../data/exercises';

const q = (v: unknown) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function toCSV(d: AppData): string {
  const rows = [['date', 'workout', 'exercise', 'role', 'set', 'weight', 'unit', 'unit_confirmed', 'reps', 'duration_sec', 'difficulty', 'completed', 'speed_mph', 'incline_pct', 'cardio_min', 'note']];
  for (const w of d.workouts) for (const e of w.exercises) {
    const name = EXERCISES[e.exerciseId]?.name ?? e.exerciseId;
    if (e.interval) rows.push([w.date, w.title, e.interval.name, e.role, '', '', '', '', q(e.interval.roundsDone), '', q(e.interval.effort), String(e.interval.completed), '', '', '', q(e.interval.moves.map((m) => EXERCISES[m]?.name ?? m).join(' / '))]);
    if (e.cardio) rows.push([w.date, w.title, name, e.role, '', '', '', '', '', '', '', String(e.cardio.completed), q(e.cardio.speedMph), q(e.cardio.inclinePct), q(e.cardio.durationMin), q(e.cardio.note)]);
    e.sets.forEach((s, i) => rows.push([w.date, w.title, name, e.role, String(i + 1), q(s.weight), s.unit, String(s.unitConfirmed), q(s.reps), q(s.durationSec), q(s.difficulty), String(s.completed), '', '', '', q(s.note)]));
  }
  return rows.map((r) => r.map(q).join(',')).join('\n');
}
