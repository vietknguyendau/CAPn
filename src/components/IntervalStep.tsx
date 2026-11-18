import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useKeepAlive } from './AutoFinish';
import { Check, Pause, Play, Plus, SkipForward, Square } from 'lucide-react';
import { useStore } from '../store';
import type { Difficulty, IntervalSpec } from '../types';
import { EXERCISES } from '../data/exercises';
import { intervalMinutes } from '../lib/estimate';
import { goToExercise } from '../lib/session';
import { Btn, Chips, Panel, Stepper, cx } from './ui';

interface Phase { kind: 'prep' | 'work' | 'rest'; sec: number; move?: string; reps?: string; round: number; label: string }

export function buildPhases(iv: IntervalSpec): Phase[] {
  const n = Math.max(1, iv.moves.length);
  const out: Phase[] = [{ kind: 'prep', sec: 10, move: iv.moves[0], reps: iv.reps?.[0], round: 1, label: 'Get ready' }];
  if (iv.format === 'amrap') {
    out.push({ kind: 'work', sec: iv.workSec, round: 1, label: 'As many rounds as possible' });
  } else if (iv.format === 'emom') {
    for (let k = 0; k < iv.rounds; k++) out.push({ kind: 'work', sec: 60, move: iv.moves[k % n], reps: iv.reps?.[k % n], round: k + 1, label: `Minute ${k + 1} of ${iv.rounds}` });
  } else if (iv.format === 'tabata') {
    for (let k = 0; k < iv.rounds; k++) {
      out.push({ kind: 'work', sec: iv.workSec, move: iv.moves[k % n], round: k + 1, label: `Round ${k + 1} of ${iv.rounds}` });
      if (k < iv.rounds - 1) out.push({ kind: 'rest', sec: iv.restSec, move: iv.moves[(k + 1) % n], round: k + 1, label: 'Rest' });
    }
  } else {
    for (let r = 0; r < iv.rounds; r++) {
      for (let i = 0; i < n; i++) {
        out.push({ kind: 'work', sec: iv.workSec, move: iv.moves[i], reps: iv.reps?.[i], round: r + 1, label: `Round ${r + 1} of ${iv.rounds}` });
        const last = i === n - 1;
        if (!last && iv.restSec) out.push({ kind: 'rest', sec: iv.restSec, move: iv.moves[i + 1], round: r + 1, label: 'Rest' });
        if (last && r < iv.rounds - 1) out.push({ kind: 'rest', sec: iv.roundRestSec ?? iv.restSec, move: iv.moves[0], round: r + 1, label: 'Round rest' });
      }
    }
  }
  return out;
}

const moveName = (id?: string) => (id ? EXERCISES[id]?.name ?? id : '');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

export const describeInterval = (iv: IntervalSpec) => {
  const moves = iv.moves.map(moveName).join(', ');
  if (iv.format === 'amrap') return `AMRAP ${Math.round(iv.workSec / 60)} min: ${moves}`;
  if (iv.format === 'emom') return `EMOM ${iv.rounds} min: ${moves}`;
  if (iv.format === 'tabata') return `Tabata ${iv.rounds} × ${iv.workSec}s/${iv.restSec}s: ${moves}`;
  return `${iv.rounds} rounds × ${iv.workSec}s on / ${iv.restSec}s off: ${moves}`;
};

// Sounds + vibration. The AudioContext is created on a tap so phones allow it.
export function useCues() {
  const ctx = useRef<AudioContext | null>(null);
  const unlock = () => {
    try { ctx.current ??= new (window.AudioContext || (window as any).webkitAudioContext)(); ctx.current.resume(); } catch { /* no audio */ }
  };
  const beep = (freq: number, ms: number) => {
    const c = ctx.current; if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.25, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + ms / 1000);
    o.start(); o.stop(c.currentTime + ms / 1000);
  };
  const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };
  return { unlock, beep, buzz };
}

export function useWakeLock(active: boolean) {
  useEffect(() => {
    let lock: any = null;
    const get = async () => { try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* not supported */ } };
    const onVis = () => { if (document.visibilityState === 'visible' && active) get(); };
    if (active) { get(); document.addEventListener('visibilitychange', onVis); }
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release(); } catch { /* ignore */ } };
  }, [active]);
}

export function IntervalStep() {
  const { data, update } = useStore();
  const a = data.active!;
  const ex = a.workout.exercises[a.index];
  const iv = ex.interval!;
  const phases = useMemo(() => buildPhases(iv), [iv]);
  const total = Math.round(intervalMinutes(iv));

  const [idx, setIdx] = useState(0);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(phases[0].sec * 1000);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(!!a.backfill || !!iv.completed);
  const [amrapRounds, setAmrapRounds] = useState(0);
  const [workDone, setWorkDone] = useState(0);
  const [, tick] = useState(0);
  const lastBeep = useRef<number | null>(null);
  const cues = useCues();
  useWakeLock(running);
  useKeepAlive(running);

  const phase = phases[idx];
  const left = running && endsAt ? Math.max(0, endsAt - Date.now()) : remaining;
  const leftSec = Math.ceil(left / 1000);

  const goTo = useCallback((next: number) => {
    if (phases[idx]?.kind === 'work') setWorkDone((w) => w + 1);
    if (next >= phases.length) { setRunning(false); setFinished(true); cues.beep(660, 600); cues.buzz([200, 100, 200, 100, 400]); return; }
    setIdx(next);
    const ms = phases[next].sec * 1000;
    setRemaining(ms);
    setEndsAt(Date.now() + ms);
    lastBeep.current = null;
    if (phases[next].kind === 'work') { cues.beep(880, 350); cues.buzz(300); } else { cues.beep(440, 350); cues.buzz([120, 80, 120]); }
  }, [idx, phases, cues]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (!endsAt) return;
      const ms = endsAt - Date.now();
      const s = Math.ceil(ms / 1000);
      if (s <= 3 && s > 0 && lastBeep.current !== s) { lastBeep.current = s; cues.beep(660, 120); }
      if (ms <= 0) goTo(idx + 1);
    }, 200);
    return () => clearInterval(t);
  }, [running, endsAt, idx, goTo, cues]);

  const toggle = () => {
    cues.unlock();
    if (running) { setRemaining(left); setRunning(false); setEndsAt(null); return; }
    setStarted(true); setRunning(true); setEndsAt(Date.now() + left);
  };

  const workPhases = phases.filter((p) => p.kind === 'work').length;
  const defaultRounds = iv.format === 'amrap' ? amrapRounds
    : iv.format === 'hiit' ? Math.floor(workDone / Math.max(1, iv.moves.length)) : workDone;
  const roundsUnit = iv.format === 'emom' ? 'minutes' : iv.format === 'tabata' ? 'intervals' : 'rounds';

  if (finished) return <FinishBlock iv={iv} unit={roundsUnit} initial={iv.completed ? iv.roundsDone : a.backfill ? null : defaultRounds} initialEffort={iv.effort}
    max={iv.format === 'amrap' ? undefined : iv.format === 'hiit' ? iv.rounds : workPhases} />;

  const next = phases[idx + 1];
  const progress = phases.slice(0, idx).reduce((s, p) => s + p.sec, 0) + (phase.sec - left / 1000);
  const totalSec = phases.reduce((s, p) => s + p.sec, 0);
  const img = phase.move ? EXERCISES[phase.move]?.images?.[0] : undefined;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-haze">{iv.name} · about {total} min</p>
        <p className="text-sm text-haze">{describeInterval(iv)}</p>
      </div>

      <div className={cx('rounded-3xl p-5 text-center transition-colors',
        phase.kind === 'work' ? 'bg-sun text-ink' : phase.kind === 'rest' ? 'bg-tide/20 text-tide' : 'bg-deck text-chalk')} role="timer" aria-live="polite">
        <p className="font-display text-xl font-semibold uppercase tracking-wide">{phase.kind === 'work' ? 'Work' : phase.kind === 'rest' ? phase.label : 'Get ready'}</p>
        <p className="font-display text-[7rem] font-bold leading-none tabular-nums">{mmss(leftSec)}</p>
        <p className={cx('text-sm', phase.kind === 'work' ? 'text-ink/70' : 'text-haze')}>{phase.kind === 'work' ? phase.label : phase.kind === 'rest' ? `Next: ${moveName(phase.move)}` : `First: ${moveName(phase.move)}`}</p>
      </div>

      {iv.format === 'amrap' ? (
        <Panel>
          <ol className="space-y-1.5">
            {iv.moves.map((m, i) => <li key={m + i} className="flex justify-between gap-2"><span className="font-semibold">{moveName(m)}</span><span className="text-haze">{iv.reps?.[i]}</span></li>)}
          </ol>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-ink p-3">
            <span>Rounds done</span>
            <span className="font-display text-4xl font-bold">{amrapRounds}</span>
            <Btn variant="tide" onClick={() => { setAmrapRounds((n) => n + 1); cues.buzz(60); }}><Plus size={18} />Round</Btn>
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="flex items-center gap-3">
            {img && <img src={img} alt="" className="h-20 w-24 shrink-0 rounded-lg bg-chalk/90 object-cover" />}
            <div className="min-w-0">
              <p className="text-sm text-haze">{phase.kind === 'work' ? 'Now' : 'Up next'}</p>
              <p className="font-display text-3xl font-semibold leading-tight">{moveName(phase.kind === 'work' ? phase.move : phase.move)}</p>
              {phase.reps && <p className="text-sun">{phase.reps}</p>}
            </div>
          </div>
          {phase.kind === 'work' && next && <p className="mt-2 text-sm text-haze">Then: {next.kind === 'rest' ? `${next.label.toLowerCase()} ${next.sec}s` : moveName(next.move)}</p>}
        </Panel>
      )}

      <div className="h-2 overflow-hidden rounded-full bg-rim" aria-hidden><div className="h-full bg-sun" style={{ width: `${Math.min(100, (progress / totalSec) * 100)}%` }} /></div>

      <div className="flex gap-2">
        <Btn size="lg" className="flex-1" variant={running ? 'ghost' : 'primary'} onClick={toggle}>
          {running ? <><Pause size={20} />Pause</> : <><Play size={20} />{started ? 'Resume' : 'Start timer'}</>}
        </Btn>
        <Btn size="lg" variant="ghost" aria-label="Skip to next interval" onClick={() => { cues.unlock(); if (!started) { setStarted(true); setRunning(true); } goTo(idx + 1); }}><SkipForward size={20} /></Btn>
      </div>
      <button className="mx-auto flex min-h-[44px] items-center gap-1 text-sm text-haze" onClick={() => { setRunning(false); setFinished(true); }}>
        <Square size={14} />Stop and log this block
      </button>
      {!started && <p className="text-center text-xs text-haze">Turn your sound on for beeps. The screen stays awake while the timer runs.</p>}
    </div>
  );
}

function FinishBlock({ iv, unit, initial, initialEffort, max }: { iv: IntervalSpec; unit: string; initial: number | null; initialEffort?: Difficulty | null; max?: number }) {
  const { data, update } = useStore();
  const [rounds, setRounds] = useState<number | null>(initial);
  const [effort, setEffort] = useState<Difficulty | null>(initialEffort ?? null);
  const save = (skipped = false) => update((d) => {
    const act = d.active!;
    const e = act.workout.exercises[act.index];
    if (skipped) e.skipped = true;
    else { e.skipped = false; e.interval = { ...e.interval!, roundsDone: rounds, effort, completed: true }; }
    act.restEndsAt = null;
    if (act.index < act.workout.exercises.length - 1) act.index++; else act.phase = 'post';
    return d;
  });
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-haze">{iv.name}</p>
        <h1 className="font-display text-4xl font-bold leading-tight">Nice work. Log it.</h1>
        <p className="mt-1 text-sm text-haze">{describeInterval(iv)}</p>
      </div>
      <Panel>
        <Stepper label={`${unit[0].toUpperCase()}${unit.slice(1)} completed`} suffix={max ? `of ${max}` : unit} step={1} decimals={false}
          value={rounds} onChange={(v) => setRounds(v == null ? null : max ? Math.min(max, v) : v)} />
        <div className="mt-5">
          <p className="mb-2 text-sm text-haze">How hard was it?</p>
          <Chips options={[{ value: 'easy', label: 'Easy' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }] as { value: Difficulty; label: string }[]} value={effort} onChange={setEffort} />
        </div>
      </Panel>
      <Btn size="lg" className="w-full" onClick={() => save()}><Check size={20} />Log block</Btn>
      {data.active!.index > 0 && <Btn variant="ghost" className="w-full" onClick={() => update((d) => goToExercise(d, d.active!.index - 1))}>Previous exercise</Btn>}
      <button className="mx-auto block min-h-[44px] text-sm text-haze" onClick={() => save(true)}>Skip this block</button>
    </div>
  );
}
