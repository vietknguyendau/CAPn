import type { AppData, DayPlan, Goal, GoalFocus } from '../types';
import { PROGRAMS, programItems, type Program } from '../data/programs';
import { estimate } from './estimate';
import { addDays, parseISO, toISO } from './date';

export const FOCUS_INFO: Record<GoalFocus, { label: string; hint: string }> = {
  lose: { label: 'Lose fat', hint: 'Strength to keep muscle, plus cardio and walks' },
  muscle: { label: 'Build muscle', hint: 'Split training with steady progression' },
  strength: { label: 'Get stronger', hint: 'Fewer reps, heavier compound lifts' },
  endurance: { label: 'Cardio fitness', hint: 'Zone 2, intervals and some strength' },
  mood: { label: 'Feel better', hint: 'Consistent, energizing, never punishing' },
  mobility: { label: 'Move better', hint: 'Mobility, core and balance' },
  sport: { label: 'Sport performance', hint: 'Prep for the sports you play' },
};
export const SPORT_PREP: Record<string, string> = {
  Golf: 'golf-strength-rotation', Snowboarding: 'snowboard-ski-prep', Basketball: 'basketball-conditioning',
  Running: 'runner-strength', Pickleball: 'pickleball-tennis-prep', Tennis: 'pickleball-tennis-prep', Soccer: 'basketball-conditioning', Football: 'athletic-power',
};
export const SPORTS = Object.keys(SPORT_PREP);

const byId = new Map(PROGRAMS.map((p) => [p.id, p]));
const minutesCache = new Map<string, number>();
export function programMinutes(p: Program) {
  if (!minutesCache.has(p.id)) minutesCache.set(p.id, estimate(programItems(p), { warmup: false, cooldown: p.cooldown }).block);
  return minutesCache.get(p.id)!;
}

type Slot = 'S' | 'H' | 'Z' | 'E' | 'M' | 'C' | 'P';
const SLOT_NAME: Record<Slot, string> = { S: 'strength', H: 'HIIT', Z: 'easy cardio', E: 'intervals', M: 'mobility', C: 'core', P: 'sport prep' };

const POOLS: Record<Exclude<Slot, 'S' | 'P'>, Record<Goal['equipment'], string[]>> = {
  H: {
    gym: ['bike-sprint-intervals', 'low-impact-hiit', 'treadmill-sprint-intervals', 'rower-power-intervals', '20-minute-bodyweight-hiit', 'gym-metcon-circuit'],
    dumbbells: ['low-impact-hiit', 'cardio-blast-25', 'dumbbell-hiit', 'dumbbell-30-minute-circuit', '20-minute-bodyweight-hiit'],
    none: ['low-impact-hiit', 'cardio-blast-25', 'beginner-bodyweight-20', '20-minute-bodyweight-hiit', 'classic-tabata', 'amrap-15-bodyweight-chipper'],
  },
  Z: {
    gym: ['12-3-30-treadmill-walk', 'zone-2-bike', 'incline-walk-intervals', 'steady-row-20', 'zone-2-walk-jog'],
    dumbbells: ['weighted-walk-rucking'], none: ['weighted-walk-rucking'],
  },
  E: {
    gym: ['run-walk-starter', 'elliptical-intervals', 'rower-power-intervals', 'treadmill-sprint-intervals', 'treadmill-sprint-pyramid'],
    dumbbells: ['cardio-blast-25', '20-minute-bodyweight-hiit', 'jump-rope-hiit'], none: ['cardio-blast-25', '20-minute-bodyweight-hiit', 'jump-rope-hiit'],
  },
  M: { gym: ['morning-mobility-10', 'hip-opener', 'full-body-stretch-20', 'desk-worker-reset', 'recovery-day-flow'],
    dumbbells: ['morning-mobility-10', 'hip-opener', 'full-body-stretch-20', 'desk-worker-reset'], none: ['morning-mobility-10', 'hip-opener', 'full-body-stretch-20', 'desk-worker-reset'] },
  C: { gym: ['core-foundations', 'anti-rotation-stability', 'plank-series', 'abs-circuit'], dumbbells: ['core-foundations', 'balance-stability', 'plank-series', 'abs-circuit'], none: ['core-foundations', 'pilates-style-mat-core', 'plank-series', 'abs-circuit'] },
};

const STRENGTH: Record<Goal['equipment'], { full: string[]; beginner: string[]; split4: string[]; ppl: string[]; power: string[] }> = {
  gym: {
    beginner: ['momentum-full-body', 'machine-only-full-body', 'full-body-a', 'full-body-b'],
    full: ['full-body-a', 'full-body-b', 'full-body-c'],
    split4: ['upper-body-a', 'lower-body-a', 'upper-body-b', 'lower-body-b'],
    ppl: ['push-day', 'pull-day', 'leg-day'],
    power: ['5-5-strength', 'full-body-b', 'the-big-three'],
  },
  dumbbells: {
    beginner: ['dumbbell-full-body-a', 'dumbbell-full-body-b'],
    full: ['dumbbell-full-body-a', 'dumbbell-full-body-b'],
    split4: ['dumbbell-upper-body', 'dumbbell-lower-body', 'dumbbell-push', 'dumbbell-pull'],
    ppl: ['dumbbell-push', 'dumbbell-pull', 'dumbbell-lower-body'],
    power: ['dumbbell-full-body-a', 'dumbbell-lower-body', 'dumbbell-upper-body'],
  },
  none: {
    beginner: ['no-equipment-full-body', 'quiet-apartment-workout', 'push-up-progression'],
    full: ['no-equipment-full-body', 'bodyweight-legs', 'push-up-progression'],
    split4: ['push-up-progression', 'bodyweight-legs', 'no-equipment-full-body', 'quiet-apartment-workout'],
    ppl: ['push-up-progression', 'no-equipment-full-body', 'bodyweight-legs'],
    power: ['bodyweight-legs', 'push-up-progression', 'no-equipment-full-body'],
  },
};
const QUICK: Record<Slot, Record<Goal['equipment'], string>> = {
  S: { gym: '15-minute-strength-express', dumbbells: 'beginner-bodyweight-20', none: 'beginner-bodyweight-20' },
  H: { gym: 'lunch-break-hiit', dumbbells: 'lunch-break-hiit', none: 'lunch-break-hiit' },
  Z: { gym: 'steady-row-20', dumbbells: 'morning-mobility-10', none: 'morning-mobility-10' },
  E: { gym: 'steady-row-20', dumbbells: '10-minute-express', none: '10-minute-express' },
  M: { gym: 'morning-mobility-10', dumbbells: 'morning-mobility-10', none: 'morning-mobility-10' },
  C: { gym: 'plank-series', dumbbells: 'plank-series', none: 'plank-series' },
  P: { gym: 'pickleball-tennis-prep', dumbbells: 'pickleball-tennis-prep', none: 'pickleball-tennis-prep' },
};

const LEVEL_OK: Record<Goal['experience'], Program['level'][]> = { new: ['beginner'], returning: ['beginner', 'intermediate'], regular: ['beginner', 'intermediate', 'advanced'] };
const EQUIP_OK: Record<Goal['equipment'], Program['equipment'][]> = { gym: ['gym', 'cardio machine', 'dumbbells', 'none'], dumbbells: ['dumbbells', 'none'], none: ['none'] };

function fits(id: string, g: Pick<Goal, 'equipment' | 'experience' | 'minutes'>) {
  const p = byId.get(id);
  return !!p && EQUIP_OK[g.equipment].includes(p.equipment) && LEVEL_OK[g.experience].includes(p.level) && programMinutes(p) <= g.minutes + 10;
}
function pick(pool: string[], g: Pick<Goal, 'equipment' | 'experience' | 'minutes'>, n: number, slot: Slot): string {
  const ok = pool.filter((id) => fits(id, g));
  if (ok.length) return ok[n % ok.length];
  const loose = pool.filter((id) => byId.has(id) && programMinutes(byId.get(id)!) <= g.minutes + 10 && EQUIP_OK[g.equipment].includes(byId.get(id)!.equipment));
  return loose.length ? loose[n % loose.length] : QUICK[slot][g.equipment];
}

const SEQ: Record<GoalFocus, Slot[]> = {
  lose: ['S', 'H', 'S', 'Z', 'S', 'H'],
  muscle: ['S', 'S', 'S', 'S', 'S', 'S'],
  strength: ['S', 'S', 'S', 'S', 'S', 'S'],
  endurance: ['Z', 'S', 'E', 'Z', 'S', 'E'],
  mood: ['S', 'Z', 'S', 'M', 'H', 'Z'],
  mobility: ['M', 'S', 'C', 'M', 'S', 'C'],
  sport: ['S', 'P', 'S', 'H', 'P', 'Z'],
};
const SIGNATURE: Record<GoalFocus, Slot> = { lose: 'H', muscle: 'S', strength: 'S', endurance: 'Z', mood: 'Z', mobility: 'M', sport: 'P' };
const POSITIONS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

function strengthSeq(g: Goal, count: number, variant: 'default' | 'alt'): string[] {
  const s = STRENGTH[g.equipment];
  const main = g.focus[0];
  if (g.experience === 'new') return s.beginner;
  if (main === 'strength' && count <= 3) return variant === 'alt' ? s.full : g.experience === 'regular' ? s.power : s.full;
  if (main === 'muscle' || main === 'strength') {
    if (count <= 3) return variant === 'alt' ? s.ppl : s.full;
    if (count === 4) return variant === 'alt' ? [...s.ppl, s.full[0]] : s.split4;
    return variant === 'alt' ? s.split4 : count === 5 ? [...s.ppl, s.split4[0], s.split4[1]] : [...s.ppl, ...s.ppl];
  }
  return g.experience === 'returning' ? s.beginner : s.full;
}

export interface PlanOption { id: string; name: string; why: string; days: DayPlan[]; sessions: number; weeklyMinutes: number }

function build(g: Goal, days: number, variant: 'default' | 'alt', swapEmphasis: boolean): DayPlan[] {
  const main = g.focus[0];
  let slots = SEQ[main].slice(0, days);
  const second = g.focus[1];
  if (second && days >= 3 && !slots.includes(SIGNATURE[second])) slots[slots.length - 1] = SIGNATURE[second];
  if (swapEmphasis) {
    const sCount = slots.filter((x) => x === 'S').length;
    if (sCount >= slots.length - 1 && slots.length >= 3) slots[slots.length - 1] = main === 'muscle' || main === 'strength' ? 'Z' : 'H';
    else { const i = slots.findIndex((x) => x !== 'S'); if (i >= 0) slots[i] = 'S'; }
  }
  if (main === 'sport' && !g.sports.length) slots = slots.map((x) => (x === 'P' ? 'H' : x));
  const rawSeq = strengthSeq(g, slots.filter((x) => x === 'S').length, variant);
  const timeOk = (id: string) => { const p = byId.get(id); return !!p && programMinutes(p) <= g.minutes + 10; };
  const sSeq = rawSeq.filter(timeOk).length ? rawSeq.filter(timeOk)
    : [...STRENGTH[g.equipment].beginner, ...STRENGTH[g.equipment].full].filter(timeOk).slice(0, 2).concat(QUICK.S[g.equipment]).filter((v, i, a) => a.indexOf(v) === i);
  const counters: Partial<Record<Slot, number>> = {};
  const week: DayPlan[] = Array.from({ length: 7 }, () => ({ kind: 'rest' }) as DayPlan);
  const pos = POSITIONS[days] ?? POSITIONS[3];
  slots.forEach((slot, k) => {
    const n = (counters[slot] = (counters[slot] ?? -1) + 1);
    let id: string;
    if (slot === 'Z' && g.equipment !== 'gym' && !POOLS.Z[g.equipment].some((x) => fits(x, g))) {
      week[pos[k]] = { kind: 'activity', label: 'Brisk walk' }; // easy cardio without machines: a brisk walk outside
      return;
    }
    if (slot === 'S') id = sSeq[n % sSeq.length];
    else if (slot === 'P') id = SPORT_PREP[g.sports[n % Math.max(1, g.sports.length)]] ?? QUICK.P[g.equipment];
    else id = pick(POOLS[slot][g.equipment], g, n, slot);
    if (!byId.has(id)) id = QUICK[slot][g.equipment];
    week[pos[k]] = { kind: 'workout', ref: { type: 'program', id } };
  });
  // Off days: walks for fat loss / mood / cardio goals, the sports you play on weekends, Sunday recovery.
  const walky = ['lose', 'mood', 'endurance'].includes(main);
  const sports = [...g.sports];
  for (const i of [5, 6, 4, 3, 2, 1]) {
    if (week[i].kind === 'rest' && sports.length && i >= 4) week[i] = { kind: 'activity', label: sports.shift()! };
  }
  for (let i = 0; i < 7; i++) {
    if (week[i].kind !== 'rest') continue;
    week[i] = i === 6 ? { kind: 'rest', label: 'Recovery' } : walky ? { kind: 'activity', label: 'Walk' } : { kind: 'rest' };
  }
  return week;
}

function describe(days: DayPlan[]) {
  const counts: Record<string, number> = {};
  for (const d of days) if (d.kind === 'workout') {
    const p = byId.get((d.ref as any).id)!;
    const k = p.category === 'Strength' || p.category === 'Dumbbell' || p.category === 'Bodyweight' || p.category === 'Kettlebell' ? 'strength' : p.category === 'Cardio' ? 'cardio' : p.category === 'HIIT' || p.category === 'EMOM & AMRAP' || p.category === 'Quick' ? 'HIIT' : p.category.toLowerCase();
    counts[k] = (counts[k] ?? 0) + 1;
  } else if (d.kind === 'activity' && d.label === 'Brisk walk') counts['brisk walk'] = (counts['brisk walk'] ?? 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ');
}

export function recommend(g: Goal): PlanOption[] {
  const main = g.focus[0];
  const cap = g.experience === 'new' ? 4 : 6;
  const days = Math.min(cap, Math.max(2, g.daysPerWeek));
  const mins = (w: DayPlan[]) => w.reduce((a, d) => a + (d.kind === 'workout' ? programMinutes(byId.get((d.ref as any).id)!) : 0), 0);
  const make = (id: string, name: string, why: string, week: DayPlan[]): PlanOption => ({ id, name, why, days: week,
    sessions: week.filter((d) => d.kind === 'workout' || (d.kind === 'activity' && d.label === 'Brisk walk')).length,
    weeklyMinutes: mins(week) + week.filter((d) => d.kind === 'activity' && d.label === 'Brisk walk').length * 30 });

  const out: PlanOption[] = [];
  const rec = build(g, days, 'default', false);
  out.push(make('recommended', 'Recommended for you',
    `${FOCUS_INFO[main].label}${g.focus[1] ? ` with some ${FOCUS_INFO[g.focus[1]].label.toLowerCase()}` : ''}: ${describe(rec)}.${days < g.daysPerWeek ? ` Starting at ${days} days so it’s sustainable; add more once it feels routine.` : ''}`, rec));

  const lightDays = Math.max(2, days - 1);
  const light = build({ ...g, experience: g.experience === 'regular' ? 'returning' : 'new', minutes: Math.min(g.minutes, 45) }, lightDays, 'default', false);
  out.push(make('lighter', 'Lighter start', `${lightDays} shorter, beginner-friendly days: ${describe(light)}. Best if life is busy or you’re easing back in.`, light));

  const alt = build(g, days, 'alt', true);
  if (JSON.stringify(alt) !== JSON.stringify(rec)) {
    out.push(make('alternative', main === 'muscle' || main === 'strength' ? 'Different split + cardio' : 'More strength',
      `${describe(alt)}. A different mix if the recommended plan doesn’t fit how you like to train.`, alt));
  }
  return out;
}

/** Weight goal math: direction, safe weekly rate and rough timeline. */
export function weightPlan(g: Goal, latest: number | null) {
  if (g.targetWeight == null) return null;
  const now = latest ?? g.startWeight;
  const diff = g.targetWeight - now;
  const dir = Math.abs(diff) < 0.5 ? 'done' : diff < 0 ? 'lose' : 'gain';
  const lb = g.unit === 'lb' ? 1 : 0.4536;
  const rate = dir === 'lose' ? (g.pace === 'steady' ? 1 : 0.5) * lb : (g.pace === 'steady' ? 0.5 : 0.25) * lb;
  const weeks = dir === 'done' ? 0 : Math.ceil(Math.abs(diff) / rate);
  const total = g.targetWeight - g.startWeight;
  const progress = total === 0 ? 1 : Math.max(0, Math.min(1, (now - g.startWeight) / total));
  const bigChange = Math.abs(total) / g.startWeight > 0.15;
  return {
    dir, now, diff: Math.round(diff * 10) / 10, rate: Math.round(rate * 100) / 100, weeks, progress, bigChange,
    eta: weeks ? toISO(addDays(new Date(), weeks * 7)) : null,
    kcalAdjust: dir === 'lose' ? (g.pace === 'steady' ? -500 : -250) : dir === 'gain' ? (g.pace === 'steady' ? 250 : 150) : 0,
    protein: Math.round((g.unit === 'lb' ? now : now / 0.4536) * 0.7), // same rule as the food-target estimator
  };
}

export const latestWeight = (d: AppData) => {
  const w = [...d.bodyweight].sort((a, b) => b.date.localeCompare(a.date))[0];
  return w ? { value: w.value, date: w.date } : null;
};
export const daysSince = (iso: string) => Math.floor((Date.now() - parseISO(iso).getTime()) / 86_400_000);
export { SLOT_NAME };
