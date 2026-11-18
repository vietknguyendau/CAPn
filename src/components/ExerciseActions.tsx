import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowRight, Minus, Plus, Repeat2, Search, Trash2, X } from 'lucide-react';
import { useStore } from '../store';
import { BODY_PARTS, EXERCISES } from '../data/exercises';
import { goToExercise, moveExercise, removeExercise, replaceExercise, setTargetSets } from '../lib/session';
import { Btn, cx } from './ui';

const done = (e: { skipped?: boolean; sets: unknown[]; cardio?: { completed: boolean }; interval?: { completed: boolean } }) =>
  !e.skipped && (e.sets.length > 0 || !!e.cardio?.completed || !!e.interval?.completed);

/** Options for one exercise in the top bar: go to it, reorder it, swap it, change sets, or remove it. */
export function ExerciseActions({ index, onClose }: { index: number; onClose: () => void }) {
  const { data, update } = useStore();
  const a = data.active!;
  const list = a.workout.exercises;
  const ex = list[index];
  const [swapping, setSwapping] = useState(false);
  if (!ex) return null;
  const def = EXERCISES[ex.exerciseId];
  const name = ex.interval ? ex.interval.name : def?.name ?? 'Exercise';
  const isCur = index === a.index && a.phase === 'exercise';
  const finished = done(ex);
  // "Later" means the end of the main work, before any finisher at the end.
  let last = list.length - 1;
  while (last > 0 && list[last].role === 'finisher' && last !== index) last--;
  const act = (fn: Parameters<typeof update>[0]) => { update(fn); onClose(); };

  // "Up next" = right after the exercise you're on (or first, if this is the current one being pushed back).
  const nextSlot = index > a.index ? a.index + 1 : a.index;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Options for ${name}`} onClick={onClose}>
      <div className="max-h-[90%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-haze">Exercise {index + 1} of {list.length}{isCur ? ' · now' : finished ? ' · done' : ex.skipped ? ' · skipped' : ''}</p>
            <h2 className="font-display text-3xl font-semibold leading-tight">{name}</h2>
            {ex.substitutedFor && EXERCISES[ex.substitutedFor] && <p className="text-sm text-haze">Swapped in for {EXERCISES[ex.substitutedFor].name}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>

        {!swapping && <p className="-mt-2 mb-3 text-xs text-haze">Tip: press and hold any name in the bar, then drag it to a new spot.</p>}
        {swapping ? (
          <SwapPicker current={ex.exerciseId} onPick={(id) => {
            if (ex.sets.length && !confirm(`Swap to ${EXERCISES[id].name}? The ${ex.sets.length} set${ex.sets.length > 1 ? 's' : ''} logged for ${name} will be cleared.`)) return;
            act((d) => replaceExercise(d, index, id));
          }} onBack={() => setSwapping(false)} />
        ) : (
          <div className="space-y-2">
            {!isCur && <Btn size="lg" className="w-full" onClick={() => act((d) => goToExercise(d, index))}><ArrowRight size={18} />Go to it now</Btn>}
            {!finished && index !== nextSlot && index > a.index && (
              <Btn variant="ghost" size="lg" className="w-full" onClick={() => act((d) => moveExercise(d, index, nextSlot))}>Make it up next</Btn>
            )}
            {!finished && index < last && (
              <Btn variant="ghost" size="lg" className="w-full" onClick={() => act((d) => {
                moveExercise(d, index, last);
                if (isCur) goToExercise(d, index); // go to the exercise that slid into this spot
                return d;
              })}><ArrowDownToLine size={18} />{isCur ? 'Machine taken? Do it later' : 'Move to the end'}</Btn>
            )}
            {!ex.interval && def && (
              <Btn variant="ghost" size="lg" className="w-full" onClick={() => setSwapping(true)}><Repeat2 size={18} />Swap for a different exercise</Btn>
            )}

            {!ex.interval && def && def.kind !== 'cardio' && (
              <div className="flex items-center justify-between rounded-xl border border-rim px-4 py-2">
                <span>Sets planned</span>
                <div className="flex items-center gap-2">
                  <button aria-label="Fewer sets" onClick={() => update((d) => setTargetSets(d, index, (ex.targetSets ?? def.targetSets) - 1))} className="grid h-10 w-10 place-items-center rounded-lg border border-rim"><Minus size={16} /></button>
                  <span className="w-8 text-center font-display text-2xl">{ex.targetSets ?? def.targetSets}</span>
                  <button aria-label="More sets" onClick={() => update((d) => setTargetSets(d, index, (ex.targetSets ?? def.targetSets) + 1))} className="grid h-10 w-10 place-items-center rounded-lg border border-rim"><Plus size={16} /></button>
                </div>
              </div>
            )}

            {list.length > 1 && (
              <Btn variant="quiet" className="w-full text-flare" onClick={() => {
                if (ex.sets.length && !confirm(`Remove ${name} and its ${ex.sets.length} logged set${ex.sets.length > 1 ? 's' : ''}?`)) return;
                act((d) => removeExercise(d, index));
              }}><Trash2 size={16} />Remove from this workout</Btn>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function SwapPicker({ current, onPick, onBack }: { current: string; onPick: (id: string) => void; onBack: () => void }) {
  const cur = EXERCISES[current];
  const [q, setQ] = useState('');
  const [part, setPart] = useState<string>(cur?.parts[0] ?? 'all');
  const s = q.trim().toLowerCase();
  const subs = (cur?.substitutes ?? []).filter((id) => EXERCISES[id]);
  const results = Object.values(EXERCISES).filter((e) => !e.archived && e.id !== current && e.id !== 'interval-block' &&
    (s ? e.name.toLowerCase().includes(s) : part === 'all' || e.parts.includes(part as never)))
    .sort((x, y) => Number(!!x.library) - Number(!!y.library) || x.name.localeCompare(y.name)).slice(0, 40);
  const Row = ({ id }: { id: string }) => {
    const e = EXERCISES[id];
    return (
      <li><button onClick={() => onPick(id)} className="flex min-h-[52px] w-full items-center justify-between gap-3 py-1.5 text-left active:bg-rim/50">
        <span className="font-semibold">{e.name}</span><span className="shrink-0 text-sm text-haze">{e.equipment}</span>
      </button></li>
    );
  };
  return (
    <div>
      {subs.length > 0 && !s && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-haze">Works the same muscles</p>
          <ul className="mb-3 divide-y divide-rim">{subs.map((id) => <Row key={id} id={id} />)}</ul>
        </>
      )}
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all exercises" aria-label="Search exercises"
          className="min-h-[48px] w-full rounded-xl border border-rim bg-ink pl-10 pr-3 text-chalk outline-none focus:border-sun" />
      </label>
      {!s && (
        <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
          {[{ id: 'all', label: 'All' }, ...BODY_PARTS].map((p) => (
            <button key={p.id} aria-pressed={part === p.id} onClick={() => setPart(p.id)}
              className={cx('min-h-[40px] shrink-0 rounded-full border px-3 text-sm', part === p.id ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk')}>{p.label}</button>
          ))}
        </div>
      )}
      <ul className="mt-1 divide-y divide-rim">{results.map((e) => <Row key={e.id} id={e.id} />)}</ul>
      <Btn variant="quiet" className="mt-2" onClick={onBack}>Back</Btn>
    </div>
  );
}
