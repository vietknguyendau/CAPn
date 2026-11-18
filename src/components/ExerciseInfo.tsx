import { X } from 'lucide-react';
import type { ExerciseDef } from '../data/exercises';
import { Badge, Btn } from './ui';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ExercisePhotos({ def, className = '' }: { def: ExerciseDef; className?: string }) {
  if (!def.images?.length) return null;
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {def.images.slice(0, 2).map((src, i) => (
        <figure key={src} className="overflow-hidden rounded-xl bg-chalk/90">
          <img src={src} alt={`${def.name}, ${i === 0 ? 'start' : 'end'} position`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          <figcaption className="bg-ink/80 py-0.5 text-center text-[11px] text-haze">{i === 0 ? 'Start' : 'Finish'}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExerciseSteps({ def }: { def: ExerciseDef }) {
  const steps = def.instructions?.length ? def.instructions : def.cues;
  return (
    <>
      {(def.level || def.primaryMuscles?.length) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {def.level && <Badge tone="sun">{cap(def.level)}</Badge>}
          {def.primaryMuscles?.map((m) => <Badge key={m} tone="tide">{cap(m)}</Badge>)}
          {def.secondaryMuscles?.map((m) => <Badge key={m}>{cap(m)}</Badge>)}
        </div>
      )}
      <ol className="list-decimal space-y-1.5 pl-5">{steps.map((c) => <li key={c}>{c}</li>)}</ol>
    </>
  );
}

export function ExerciseInfo({ def, selected, onToggle, onClose }: { def: ExerciseDef; selected: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={def.name} onClick={onClose}>
      <div className="max-h-[90%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-3xl font-semibold leading-tight">{def.name}</h2>
            <p className="text-sm text-haze">{def.equipment}{def.perHand ? ' · weight per hand' : ''}{def.unilateral ? ' · one side at a time' : ''}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <ExercisePhotos def={def} className="mb-4" />
        <ExerciseSteps def={def} />
        <a className="mt-3 inline-block text-sm font-semibold text-sun underline underline-offset-4" target="_blank" rel="noreferrer"
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(def.name + ' proper form')}`}>Watch a demo on YouTube</a>
        <Btn size="lg" variant={selected ? 'ghost' : 'primary'} className="mt-4 w-full" onClick={() => { onToggle(); onClose(); }}>
          {selected ? 'Remove from workout' : 'Add to workout'}
        </Btn>
      </div>
    </div>
  );
}
