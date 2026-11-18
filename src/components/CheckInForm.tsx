import { useState, type ReactNode } from 'react';
import { Btn, Scale } from './ui';

export interface CheckInValues {
  mood: number | null; energy: number | null; stress: number | null;
  motivation: number | null; fatigue: number | null; soreness: number | null; note: string;
}

export function CheckInForm({ question = 'How are you feeling right now?', fields, submitLabel, onSubmit, onSkip, children, initial }: {
  question?: string;
  fields: ('energy' | 'stress' | 'motivation' | 'fatigue' | 'soreness')[];
  submitLabel: string;
  onSubmit: (v: CheckInValues) => void;
  onSkip?: () => void;
  children?: (v: CheckInValues) => ReactNode;
  initial?: Partial<CheckInValues>;
}) {
  const [v, setV] = useState<CheckInValues>({ mood: null, energy: null, stress: null, motivation: null, fatigue: null, soreness: null, note: '', ...initial });
  const set = (k: keyof CheckInValues) => (x: number | null) => setV((p) => ({ ...p, [k]: x }));
  const meta = {
    energy: ['Energy', 'Drained', 'Charged'],
    stress: ['Stress', 'Calm', 'Very stressed'],
    motivation: ['Motivation', 'Low', 'Fired up'],
    fatigue: ['Physical fatigue', 'Fresh', 'Spent'],
    soreness: ['Soreness', 'None', 'Very sore'],
  } as const;
  return (
    <div className="space-y-5">
      <h2 className="font-display text-3xl font-semibold leading-tight">{question}</h2>
      <Scale label="Mood, 1–10" value={v.mood} onChange={set('mood')} lowHint="Rough" highHint="Great" />
      {fields.map((f) => (
        <Scale key={f} max={5} tone="sun" label={`${meta[f][0]} (optional)`} lowHint={meta[f][1]} highHint={meta[f][2]} value={v[f]} onChange={set(f)} />
      ))}
      <label className="block">
        <span className="mb-2 block text-sm text-haze">Notes (optional)</span>
        <textarea value={v.note} onChange={(e) => setV((p) => ({ ...p, note: e.target.value }))} rows={2}
          className="w-full rounded-xl border border-rim bg-ink p-3 text-chalk outline-none focus:border-sun" placeholder="Anything worth remembering?" />
      </label>
      {children?.(v)}
      <div className="flex gap-2">
        <Btn size="lg" className="flex-1" onClick={() => onSubmit(v)}>{submitLabel}</Btn>
        {onSkip && <Btn size="lg" variant="ghost" onClick={onSkip}>Skip</Btn>}
      </div>
    </div>
  );
}
