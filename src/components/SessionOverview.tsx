import { useState } from 'react';
import { Check, ChevronRight, Plus, Search, SkipForward, X } from 'lucide-react';
import { useStore } from '../store';
import { EXERCISES } from '../data/exercises';
import { addExerciseToSession, goToExercise } from '../lib/session';
import { Btn, cx } from './ui';

/** Every exercise in the session with its status. Tap one to go back to it, or add another. */
export function SessionOverview({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const a = data.active!;
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');

  const status = (i: number) => {
    const e = a.workout.exercises[i];
    if (e.skipped) return { text: 'Skipped', tone: 'text-flare' };
    if (e.interval?.completed) return { text: `${e.interval.roundsDone ?? '–'} done`, tone: 'text-tide' };
    if (e.cardio?.completed) return { text: `${e.cardio.durationMin ?? '–'} min`, tone: 'text-tide' };
    if (e.sets.length) return { text: `${e.sets.length} set${e.sets.length > 1 ? 's' : ''}`, tone: 'text-tide' };
    return { text: i < a.index ? 'Not logged' : 'Up next', tone: 'text-haze' };
  };
  const done = (i: number) => { const e = a.workout.exercises[i]; return !e.skipped && (e.sets.length > 0 || e.cardio?.completed || e.interval?.completed); };

  const s = q.trim().toLowerCase();
  const results = picking ? Object.values(EXERCISES).filter((e) => !e.archived && (!s || e.name.toLowerCase().includes(s))).slice(0, 40) : [];

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Exercises in this workout" onClick={onClose}>
      <div className="max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">{picking ? 'Add an exercise' : 'This workout'}</h2>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>

        {!picking ? (
          <>
            <ol className="divide-y divide-rim rounded-2xl border border-rim">
              {a.workout.exercises.map((e, i) => {
                const st = status(i);
                const name = e.interval ? e.interval.name : EXERCISES[e.exerciseId]?.name ?? e.exerciseId;
                return (
                  <li key={e.id}>
                    <button onClick={() => { update((d) => goToExercise(d, i)); onClose(); }}
                      className={cx('flex min-h-[56px] w-full items-center gap-3 px-4 text-left active:bg-rim/60', i === a.index && a.phase === 'exercise' && 'bg-sun/10')}>
                      <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold',
                        done(i) ? 'bg-tide text-ink' : e.skipped ? 'bg-flare/20 text-flare' : 'bg-rim text-haze')}>
                        {done(i) ? <Check size={16} /> : e.skipped ? <SkipForward size={14} /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{name}{e.role !== 'main' && <span className="font-normal text-haze"> · {e.role}</span>}</span>
                        <span className={cx('text-sm', st.tone)}>{st.text}</span>
                      </span>
                      <ChevronRight size={18} className="text-haze" />
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Btn variant="ghost" onClick={() => setPicking(true)}><Plus size={16} />Add exercise</Btn>
              <Btn onClick={() => { update((d) => { d.active!.phase = 'post'; d.active!.restEndsAt = null; return d; }); onClose(); }}>
                {a.editingId ? 'Review & save' : 'Finish workout'}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <label className="relative block">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
              <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises"
                className="min-h-[48px] w-full rounded-xl border border-rim bg-ink pl-10 pr-3 text-chalk outline-none focus:border-sun" />
            </label>
            <ul className="mt-2 divide-y divide-rim">
              {results.map((e) => (
                <li key={e.id}>
                  <button onClick={() => { update((d) => addExerciseToSession(d, e.id)); onClose(); }} className="flex min-h-[48px] w-full items-center justify-between gap-2 text-left active:bg-rim/60">
                    <span className="font-semibold">{e.name}</span><span className="text-sm text-haze">{e.equipment}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Btn variant="quiet" className="mt-2" onClick={() => setPicking(false)}>Back to list</Btn>
          </>
        )}
      </div>
    </div>
  );
}
