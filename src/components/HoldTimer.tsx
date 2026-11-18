import { useEffect, useRef, useState } from 'react';
import { useKeepAlive } from './AutoFinish';
import { Check, Minus, Pause, Play, Plus, RotateCcw, Square } from 'lucide-react';
import { useCues, useWakeLock } from './IntervalStep';
import { Btn, cx } from './ui';

type Phase = 'idle' | 'prep' | 'hold' | 'switch' | 'done';
const PREP = 5;
const SWITCH = 5;

/**
 * Countdown for timed holds (planks, wall sits, stretches).
 * The target comes from what's chosen; when it ends (or you stop early), the time held is reported.
 */
export function HoldTimer({ target, onTarget, onHeld, perSide }: {
  target: number; onTarget: (s: number) => void; onHeld: (s: number) => void; perSide?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [side, setSide] = useState(1);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [heldSide1, setHeldSide1] = useState(0);
  const [held, setHeld] = useState<number | null>(null);
  const [, tick] = useState(0);
  const lastBeep = useRef<number | null>(null);
  const cues = useCues();
  const running = (phase === 'prep' || phase === 'hold' || phase === 'switch') && pausedLeft == null;
  useWakeLock(running);
  useKeepAlive(running);

  const phaseLen = phase === 'prep' ? PREP : phase === 'switch' ? SWITCH : target;
  const leftMs = pausedLeft ?? (endsAt ? Math.max(0, endsAt - Date.now()) : phaseLen * 1000);
  const left = Math.ceil(leftMs / 1000);

  // Chained phases start from the previous phase's end time, so timer ticks never add drift.
  const begin = (p: Phase, sec: number, from = Date.now()) => { setPhase(p); setEndsAt(from + sec * 1000); setPausedLeft(null); lastBeep.current = null; };

  const finish = (secondsHeld: number) => {
    const total = perSide && side === 2 ? Math.min(heldSide1, secondsHeld) : secondsHeld; // per-side: the shorter side counts
    setHeld(total); onHeld(total); setPhase('done'); setEndsAt(null);
    cues.beep(660, 600); cues.buzz([200, 100, 400]);
  };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (!endsAt) return;
      const ms = endsAt - Date.now();
      const s = Math.ceil(ms / 1000);
      if (s <= 3 && s > 0 && lastBeep.current !== s) { lastBeep.current = s; cues.beep(660, 120); }
      if (ms > 0) return;
      if (phase === 'prep' || phase === 'switch') { cues.beep(880, 350); cues.buzz(300); begin('hold', target, endsAt); }
      else if (phase === 'hold' && perSide && side === 1) { setHeldSide1(target); setSide(2); cues.beep(440, 350); cues.buzz([120, 80, 120]); begin('switch', SWITCH, endsAt); }
      else if (phase === 'hold') finish(target);
    }, 200);
    return () => clearInterval(t);
  });

  const start = () => { cues.unlock(); setSide(1); setHeldSide1(0); setHeld(null); begin('prep', PREP); };
  const pauseResume = () => {
    cues.unlock();
    if (pausedLeft != null) { setEndsAt(Date.now() + pausedLeft); setPausedLeft(null); }
    else { setPausedLeft(leftMs); }
  };
  const stopEarly = () => {
    const done = phase === 'hold' ? Math.max(0, Math.round((target * 1000 - leftMs) / 1000)) : 0;
    if (perSide && side === 1 && phase === 'hold') { setHeldSide1(done); setSide(2); begin('switch', SWITCH); return; }
    finish(done);
  };
  const reset = () => { setPhase('idle'); setEndsAt(null); setPausedLeft(null); setSide(1); setHeld(null); };
  const adjust = (d: number) => onTarget(Math.max(5, target + d));

  const tone = phase === 'hold' ? 'bg-sun text-ink' : phase === 'prep' || phase === 'switch' ? 'bg-tide/20 text-tide' : phase === 'done' ? 'bg-tide/15 text-tide' : 'bg-ink text-chalk';
  const label = phase === 'prep' ? 'Get in position' : phase === 'switch' ? 'Switch sides' : phase === 'hold' ? (perSide ? `Hold · side ${side} of 2` : 'Hold') : phase === 'done' ? 'Done' : `Target${perSide ? ' per side' : ''}`;
  const big = phase === 'idle' ? target : phase === 'done' ? held ?? 0 : left;

  return (
    <div>
      <div className={cx('rounded-2xl p-4 text-center transition-colors', tone)} role="timer" aria-live="polite">
        <p className="font-display text-lg font-semibold uppercase tracking-wide">{label}</p>
        <div className="flex items-center justify-center gap-3">
          {phase === 'idle' && <button aria-label="5 seconds less" onClick={() => adjust(-5)} className="grid h-12 w-12 place-items-center rounded-xl border border-rim text-chalk"><Minus size={20} /></button>}
          <p className="font-display text-[5.5rem] font-bold leading-none tabular-nums">{Math.floor(big / 60)}:{String(big % 60).padStart(2, '0')}</p>
          {phase === 'idle' && <button aria-label="5 seconds more" onClick={() => adjust(5)} className="grid h-12 w-12 place-items-center rounded-xl border border-rim text-chalk"><Plus size={20} /></button>}
        </div>
        {phase === 'done' && <p className="flex items-center justify-center gap-1 text-sm"><Check size={16} />{held === target ? 'Full hold!' : `Held ${held}s of ${target}s`}{perSide ? ' (shorter side)' : ''}. Rate it and complete the set.</p>}
        {phase === 'idle' && <p className="text-sm text-haze">Starts with a {PREP}-second countdown{perSide ? ', then both sides' : ''}.</p>}
      </div>
      <div className="mt-3 flex gap-2">
        {phase === 'idle' && <Btn variant="tide" size="lg" className="flex-1" onClick={start}><Play size={20} />Start {target}s hold</Btn>}
        {running || pausedLeft != null ? (
          <>
            <Btn variant="ghost" size="lg" className="flex-1" onClick={pauseResume}>{pausedLeft != null ? <><Play size={20} />Resume</> : <><Pause size={20} />Pause</>}</Btn>
            <Btn variant="ghost" size="lg" onClick={stopEarly}><Square size={18} />Stop</Btn>
          </>
        ) : null}
        {phase === 'done' && <Btn variant="ghost" className="flex-1" onClick={reset}><RotateCcw size={16} />Redo hold</Btn>}
      </div>
    </div>
  );
}
