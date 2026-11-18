import type { IntervalSpec, Role, Settings } from '../types';
import { EXERCISES } from '../data/exercises';
import { toMinutes } from './date';

export interface EstimateItem { exerciseId: string; sets?: number; minutes?: number; role?: Role; interval?: IntervalSpec }

export interface Estimate {
  warmup: number; lifting: number; rest: number; setup: number; cardio: number; cooldown: number; buffer: number;
  training: number; block: number; low: number; high: number; workingSets: number;
}

const SEC_PER_REP = 4;      // ~2 down, ~2 up, controlled tempo
const SET_SETUP_SEC = 15;   // grab handles, settle in
const SWITCH_MIN = 1.5;     // move to next station, adjust seat and pin
const BUFFER_MIN = 5;       // waiting for a machine, water, phone
const r5 = (n: number) => Math.ceil(n / 5) * 5;
const r1 = (n: number) => Math.round(n * 10) / 10;

// Time is an estimate built from sets × reps × tempo, rest between sets,
// and time to switch stations. Cardio uses the minutes you set.
export function estimate(items: EstimateItem[], opts: { warmup: boolean; cooldown: boolean }): Estimate {
  let lifting = 0, rest = 0, setup = 0, cardio = 0, workingSets = 0;
  for (const it of items) {
    if (it.interval) { cardio += intervalMinutes(it.interval) + 1; workingSets += 0; continue; }
    const def = EXERCISES[it.exerciseId];
    if (!def) continue;
    if (def.kind === 'cardio') {
      cardio += it.minutes ?? (it.role === 'warmup' ? 5 : it.role === 'finisher' ? 8 : 10);
      continue;
    }
    const sets = it.sets ?? def.targetSets;
    const sides = def.unilateral ? 2 : 1;
    const perSetSec = def.kind === 'timed'
      ? (def.targetSec ?? 30) * sides + SET_SETUP_SEC
      : (def.repRange?.[1] ?? 10) * SEC_PER_REP * sides + SET_SETUP_SEC;
    lifting += (sets * perSetSec) / 60;
    rest += (Math.max(0, sets - 1) * def.restSec) / 60;
    setup += SWITCH_MIN;
    workingSets += sets;
  }
  const warmup = opts.warmup ? 5 : 0;
  const cooldown = opts.cooldown ? 5 : 0;
  const training = warmup + lifting + rest + setup + cardio + cooldown;
  const buffer = items.length ? BUFFER_MIN : 0;
  return {
    warmup, lifting: r1(lifting), rest: r1(rest), setup: r1(setup), cardio, cooldown, buffer,
    training: Math.round(training), block: items.length ? r5(training + buffer) : 0,
    low: Math.max(5, Math.floor((training * 0.9) / 5) * 5), high: r5(training * 1.15), workingSets,
  };
}

export function guidance(e: Estimate, settings: Settings): { tone: 'ok' | 'warn'; text: string }[] {
  const out: { tone: 'ok' | 'warn'; text: string }[] = [];
  if (!e.block) return out;
  const fits = settings.windows.filter((w) => toMinutes(w.end) - toMinutes(w.start) >= e.block);
  const shortest = Math.min(...settings.windows.map((w) => toMinutes(w.end) - toMinutes(w.start)));
  if (fits.length === settings.windows.length) out.push({ tone: 'ok', text: `Fits any of your workout windows (${shortest} min).` });
  else if (fits.length) out.push({ tone: 'ok', text: `Fits ${fits.map((w) => w.label).join(' and ')}. Too long for your other windows.` });
  else out.push({ tone: 'warn', text: `Longer than your ${shortest}-minute windows. Drop a set per exercise or cut an exercise to fit.` });
  if (e.workingSets > 18) out.push({ tone: 'warn', text: `${e.workingSets} working sets is a lot while you rebuild. 2 sets each, or fewer exercises, keeps you finishing energized.` });
  if (e.training <= 20) out.push({ tone: 'ok', text: 'Short and doable. Great for a busy or low-energy day.' });
  return out;
}

/** Length of an interval block in minutes. */
export function intervalMinutes(iv: IntervalSpec): number {
  const n = Math.max(1, iv.moves.length);
  if (iv.format === 'amrap') return iv.workSec / 60;
  if (iv.format === 'emom') return iv.rounds;
  if (iv.format === 'tabata') return (iv.rounds * (iv.workSec + iv.restSec)) / 60;
  const perRound = n * (iv.workSec + iv.restSec) - iv.restSec;
  return (iv.rounds * perRound + Math.max(0, iv.rounds - 1) * (iv.roundRestSec ?? iv.restSec)) / 60;
}
