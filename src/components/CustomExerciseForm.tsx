import { useState } from 'react';
import { X } from 'lucide-react';
import type { BodyPart, CustomExercise, ExerciseKind, WeightUnit } from '../types';
import { BODY_PARTS } from '../data/exercises';
import { uid } from '../lib/date';
import { Btn, Chips, Toggle, cx } from './ui';

const EQUIPMENT = ['Machine', 'Dumbbells', 'Barbell', 'Cable machine', 'Kettlebell', 'Bands', 'Bodyweight', 'Other'];
const field = 'min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun';

export function CustomExerciseForm({ initial, defaultPart, onSave, onClose }: {
  initial?: CustomExercise; defaultPart?: BodyPart; onSave: (c: CustomExercise) => void; onClose: () => void;
}) {
  const startPart = initial?.parts[0] ?? defaultPart ?? 'chest';
  const [name, setName] = useState(initial?.name ?? '');
  const [part, setPart] = useState<BodyPart>(startPart);
  const [kind, setKind] = useState<ExerciseKind>(initial?.kind ?? (startPart === 'cardio' || startPart === 'sports' ? 'cardio' : 'strength'));
  const [equipment, setEquipment] = useState(initial?.equipment ?? (startPart === 'sports' ? 'Activity' : 'Machine'));
  const [unilateral, setUnilateral] = useState(initial?.unilateral ?? false);
  const [repLow, setRepLow] = useState(initial?.repRange?.[0] ?? 10);
  const [repHigh, setRepHigh] = useState(initial?.repRange?.[1] ?? 12);
  const [secs, setSecs] = useState(initial?.targetSec ?? 30);
  const [minutes, setMinutes] = useState(initial?.defaultMinutes ?? (startPart === 'sports' ? 60 : 20));
  const [rest, setRest] = useState(initial?.restSec ?? 90);
  const [unit, setUnit] = useState<WeightUnit>(initial?.defaultUnit ?? 'lb');

  const pickPart = (p: BodyPart) => {
    setPart(p);
    if (!initial) {
      if (p === 'cardio' || p === 'sports') { setKind('cardio'); setEquipment(p === 'sports' ? 'Activity' : 'Machine'); }
      else if (kind === 'cardio') setKind('strength');
    }
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    onSave({
      id: initial?.id ?? `custom-${uid()}`,
      name: n, kind, parts: [part], equipment: kind === 'cardio' ? equipment || 'Activity' : equipment,
      perHand: kind === 'strength' && (equipment === 'Dumbbells' || equipment === 'Kettlebell'),
      unilateral: kind !== 'cardio' && unilateral,
      bodyweight: kind === 'strength' && (equipment === 'Bodyweight' || equipment === 'Bands'),
      repRange: kind === 'strength' ? [Math.min(repLow, repHigh), Math.max(repLow, repHigh)] : undefined,
      targetSec: kind === 'timed' ? secs : undefined,
      defaultMinutes: kind === 'cardio' ? minutes : undefined,
      restSec: kind === 'cardio' ? 0 : rest,
      defaultUnit: unit,
      archived: initial?.archived,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  };

  const num = (v: number, set: (n: number) => void, label: string, min = 1) => (
    <label className="flex-1"><span className="mb-1 block text-sm text-haze">{label}</span>
      <input type="number" inputMode="numeric" min={min} value={v} onChange={(e) => set(Math.max(min, Number(e.target.value) || min))} className={field} /></label>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add your own exercise">
      <div className="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">{initial ? 'Edit exercise' : 'Add your own'}</h2>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <div className="space-y-4 pb-4">
          <label className="block"><span className="mb-1 block text-sm text-haze">Name</span>
            <input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder={part === 'sports' ? 'e.g. Volleyball' : 'e.g. Cable chest fly'} /></label>

          <div><p className="mb-2 text-sm text-haze">Category</p>
            <div className="flex flex-wrap gap-2">
              {BODY_PARTS.map((p) => (
                <button key={p.id} aria-pressed={part === p.id} onClick={() => pickPart(p.id)}
                  className={cx('min-h-[40px] rounded-full border px-3 text-sm', part === p.id ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk')}>{p.label}</button>
              ))}
            </div>
          </div>

          <div><p className="mb-2 text-sm text-haze">How do you log it?</p>
            <Chips value={kind} onChange={setKind} options={[
              { value: 'strength', label: 'Weight × reps' }, { value: 'timed', label: 'Timed hold' }, { value: 'cardio', label: 'Minutes' },
            ]} />
          </div>

          {kind === 'strength' && (
            <>
              <div><p className="mb-2 text-sm text-haze">Equipment</p>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT.map((e) => (
                    <button key={e} aria-pressed={equipment === e} onClick={() => setEquipment(e)}
                      className={cx('min-h-[40px] rounded-full border px-3 text-sm', equipment === e ? 'border-chalk text-chalk' : 'border-rim text-haze')}>{e}</button>
                  ))}
                </div>
                {(equipment === 'Dumbbells' || equipment === 'Kettlebell') && <p className="mt-1 text-xs text-haze">Weight is logged per hand.</p>}
              </div>
              <div className="flex gap-3">{num(repLow, setRepLow, 'Reps from')}{num(repHigh, setRepHigh, 'to')}</div>
              {equipment === 'Machine' || equipment === 'Cable machine' ? (
                <div><p className="mb-2 text-sm text-haze">Weight shown on the machine</p>
                  <Chips value={unit} onChange={setUnit} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }, { value: 'machine', label: 'Machine units' }]} />
                </div>
              ) : null}
            </>
          )}
          {kind === 'timed' && <div className="flex gap-3">{num(secs, setSecs, 'Hold (seconds)', 5)}</div>}
          {kind === 'cardio' && <div className="flex gap-3">{num(minutes, setMinutes, 'Usual length (minutes)', 5)}</div>}
          {kind !== 'cardio' && (
            <>
              <Toggle label="One side at a time" hint="Reps or time are per side" checked={unilateral} onChange={setUnilateral} />
              <div><p className="mb-2 text-sm text-haze">Rest between sets</p>
                <Chips value={String(rest)} onChange={(v) => setRest(Number(v))} options={[45, 60, 90, 120].map((n) => ({ value: String(n), label: `${n}s` }))} />
              </div>
            </>
          )}
        </div>
        <div className="sticky bottom-0 flex gap-2 bg-deck pt-2">
          <Btn size="lg" className="flex-1" disabled={!name.trim()} onClick={save}>{initial ? 'Save changes' : 'Add exercise'}</Btn>
          <Btn size="lg" variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
