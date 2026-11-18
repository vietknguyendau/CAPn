import type { Activity, AppData, DayPlan, Settings } from '../types';
import { TEMPLATES, findExerciseInText, type TemplateItem } from '../data/exercises';
import { uid } from './date';
import { PROGRAMS, programItems, resolveMove } from '../data/programs';
import { draftToItems, startCustom, startProgram, startSession } from './session';
import { estimate } from './estimate';
import { dayIdx, parseISO } from './date';

const LEGACY: Record<Activity, DayPlan> = {
  strength: { kind: 'workout', ref: { type: 'template', id: 'full' } },
  walk: { kind: 'activity', label: 'Walk' },
  light: { kind: 'activity', label: 'Light cardio' },
  recreation: { kind: 'activity', label: 'Play' },
  recovery: { kind: 'rest', label: 'Recovery' },
  rest: { kind: 'rest' },
};
export const toDayPlan = (x: DayPlan | Activity | undefined): DayPlan => (!x ? { kind: 'rest' } : typeof x === 'string' ? LEGACY[x] ?? { kind: 'rest' } : x);

export const planFor = (iso: string, s: Settings): DayPlan => toDayPlan(s.overrides[iso] ?? s.weeklyPlan[dayIdx(parseISO(iso))]);
export const isWorkout = (p: DayPlan) => p.kind === 'workout';

function refName(p: Extract<DayPlan, { kind: 'workout' }>, d: AppData): string | null {
  const r = p.ref;
  if (r.type === 'template') return TEMPLATES[r.id]?.title ?? null;
  if (r.type === 'routine') return d.routines.find((x) => x.id === r.id)?.name ?? null;
  return PROGRAMS.find((x) => x.id === r.id)?.name ?? null;
}

export function planName(p: DayPlan, d: AppData): string {
  if (p.kind === 'rest') return p.label || 'Rest';
  if (p.kind === 'activity') return p.label;
  return p.label || refName(p, d) || 'Workout (removed)';
}

/** Short tag for the week strip: first word, max 6 letters. */
export function planShort(p: DayPlan, d: AppData): string {
  if (p.kind === 'workout' && !p.label && p.ref.type === 'template') return p.ref.id === 'quick' ? '15 min' : 'Lift';
  const name = planName(p, d);
  if (/^zone 2/i.test(name)) return 'Zone 2';
  if (/^12-3-30/.test(name)) return '12-3-30';
  if (/^brisk walk/i.test(name)) return 'Walk';
  if (/tabata|hiit|emom|amrap|interval/i.test(name)) return 'HIIT';
  const w = name.replace(/^\d+[-\s]?(minute|min)\s*/i, '').split(/[\s/:&,]+/)[0] || name;
  return w.length > 6 ? w.slice(0, 5) + '…' : w;
}

export function planItems(p: DayPlan, d: AppData): TemplateItem[] | null {
  if (p.kind !== 'workout') return null;
  const r = p.ref;
  if (r.type === 'template') return TEMPLATES[r.id]?.items ?? null;
  if (r.type === 'routine') { const x = d.routines.find((y) => y.id === r.id); return x ? draftToItems(x) : null; }
  const prog = PROGRAMS.find((y) => y.id === r.id);
  return prog ? programItems(prog) : null;
}

export function planMinutes(p: DayPlan, d: AppData): number | null {
  const items = planItems(p, d);
  if (!items) return null;
  const cooldown = p.kind === 'workout' && p.ref.type === 'program' ? PROGRAMS.find((x) => x.id === (p.ref as any).id)?.cooldown ?? true
    : p.kind === 'workout' && p.ref.type === 'routine' ? d.routines.find((x) => x.id === (p.ref as any).id)?.cooldown ?? true
    : p.kind === 'workout' && p.ref.type === 'template' ? TEMPLATES[p.ref.id].cooldown : true;
  return estimate(items, { warmup: false, cooldown }).block;
}

export function planDetail(p: DayPlan, d: AppData): string {
  if (p.kind === 'rest') return 'Recovery is part of training. Walk, stretch, sleep well.';
  if (p.kind === 'activity') return 'Your activity for the day. Log it when you’re done.';
  const items = planItems(p, d);
  if (!items) return 'This workout was removed. Pick another for this day.';
  const main = items.filter((i) => i.role === 'main').length;
  return `${main} block${main === 1 ? '' : 's'} · about ${planMinutes(p, d)} min`;
}

/** Start today's (or a past day's) planned workout. Returns false if the plan can't start. */
export function startPlan(d: AppData, p: DayPlan, date?: string): boolean {
  if (p.kind === 'workout') {
    const r = p.ref;
    if (r.type === 'template') { startSession(d, r.id, date); d.active!.workout.title = planName(p, d); return true; }
    if (r.type === 'routine') { const x = d.routines.find((y) => y.id === r.id); if (!x) return false; startCustom(d, x, planName(p, d), date); return true; }
    const prog = PROGRAMS.find((y) => y.id === r.id); if (!prog) return false;
    startProgram(d, prog, date); if (p.label) d.active!.workout.title = p.label; return true;
  }
  if (p.kind === 'activity') {
    // Log the activity as its matching sport/cardio exercise (Basketball, Hiking…), or create one with that name.
    const ALIAS: Record<string, string> = { walk: 'Trail Running/Walking', 'brisk walk': 'Trail Running/Walking', run: 'Running, Treadmill', 'light cardio': 'bike', stretch: 'yoga' };
    let id = resolveMove(ALIAS[p.label.toLowerCase()] ?? p.label) ?? findExerciseInText(p.label);
    if (!id) {
      const existing = d.customExercises.find((c) => c.name.toLowerCase() === p.label.toLowerCase());
      id = existing?.id ?? `custom-${uid()}`;
      if (!existing) d.customExercises.push({ id, name: p.label, kind: 'cardio', parts: ['sports'], equipment: 'Activity', restSec: 0, defaultUnit: 'lb', defaultMinutes: 45, createdAt: new Date().toISOString() });
    }
    startCustom(d, { items: [{ exerciseId: id, sets: 1 }], warmup: false, cooldown: false }, p.label, date);
    return true;
  }
  return false;
}

export const ACTIVITY_SUGGESTIONS = ['Walk', 'Basketball', 'Football', 'Soccer', 'Golf', 'Pickleball', 'Tennis', 'Snowboarding', 'Hiking', 'Swimming', 'Yoga', 'Light cardio', 'Stretch', 'Run'];
