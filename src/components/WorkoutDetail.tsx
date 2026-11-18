import type { AppData, Workout } from '../types';
import { EXERCISES, unitLabel } from '../data/exercises';
import { Badge } from './ui';
import { describeInterval } from './IntervalStep';

export function WorkoutDetail({ w, data }: { w: Workout; data: AppData }) {
  const pre = data.checkIns.find((c) => c.id === w.preCheckInId);
  const post = data.checkIns.find((c) => c.id === w.postCheckInId);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone="tide">Mood {pre?.mood ?? '–'} → {post?.mood ?? '–'}</Badge>
        <Badge>{w.activeSec ? `${Math.floor(w.activeSec / 60)}:${String(w.activeSec % 60).padStart(2, '0')} workout time` : w.durationMin != null ? `${w.durationMin} min` : 'Duration not recorded'}{w.plannedMin ? ` (est. ${w.plannedMin})` : ''}</Badge>
        {w.soreness != null && <Badge>Soreness {w.soreness}/5</Badge>}
        {w.autoFinished && <Badge>Auto-finished</Badge>}
      </div>
      <ul className="divide-y divide-rim">
        {w.exercises.map((e) => {
          const def = EXERCISES[e.exerciseId];
          return (
            <li key={e.id} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{e.interval ? e.interval.name : def?.name}{e.role !== 'main' && <span className="font-normal text-haze"> · {e.role === 'warmup' ? 'warm-up' : 'finisher'}</span>}</span>
                {e.skipped && <Badge>Skipped</Badge>}
                {!e.skipped && e.lateBy != null && <Badge>Done late · after {e.setsBefore} sets</Badge>}
              </div>
              {e.interval && (
                <p className="text-sm text-haze">
                  {describeInterval(e.interval)}
                  {e.interval.completed && ` · ${e.interval.roundsDone ?? '–'} ${e.interval.format === 'emom' ? 'min' : e.interval.format === 'tabata' ? 'intervals' : 'rounds'}${e.interval.effort ? `, felt ${e.interval.effort}` : ''}`}
                </p>
              )}
              {e.cardio && (
                <p className="text-sm text-haze">
                  {[e.cardio.speedMph != null && `${e.cardio.speedMph} mph`, e.cardio.inclinePct != null && `${e.cardio.inclinePct}% incline`,
                    e.cardio.durationMin != null && `${e.cardio.durationMin} min`, e.cardio.effort && `felt ${e.cardio.effort}`].filter(Boolean).join(' · ') || 'Completed, details not recorded'}
                </p>
              )}
              {e.sets.length > 0 && (
                <p className="text-sm text-haze">
                  {e.sets.map((s, i) => {
                    if (!s.completed) return <span key={s.id} className="text-flare">{i ? ', ' : ''}{s.note ?? 'not confirmed'}</span>;
                    const txt = def?.kind === 'timed' ? (s.durationSec != null ? `${s.durationSec}s` : 'done, time not recorded')
                      : `${s.weight != null ? `${s.weight} ${unitLabel(s.unit)}${def?.perHand ? ' ea' : ''}` : 'BW'}${s.reps != null ? ` × ${s.reps}` : ' (reps not recorded)'}`;
                    return <span key={s.id}>{i ? ', ' : ''}{txt}{!s.unitConfirmed && <span className="text-flare"> (unit unverified)</span>}</span>;
                  })}
                </p>
              )}
              {e.feedback && <p className="text-sm italic text-haze">“{e.feedback}”</p>}
            </li>
          );
        })}
      </ul>
      {(w.notes || post?.note) && <p className="text-sm">{w.notes ?? post?.note}</p>}
      {w.dataNotes && w.dataNotes.length > 0 && (
        <details className="text-sm text-haze">
          <summary className="cursor-pointer py-1">What wasn’t recorded</summary>
          <ul className="mt-1 list-disc pl-5">{w.dataNotes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
