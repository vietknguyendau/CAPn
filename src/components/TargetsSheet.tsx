import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { estimateTargets, nutritionOf } from '../lib/nutrition';
import { Btn, Chips, Toggle } from './ui';

const field = 'min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun';

export function TargetsSheet({ onClose, preset }: { onClose: () => void; preset?: { lb: number; goal: 'lose' | 'lose-slow' | 'maintain' | 'gain-slow' } }) {
  const { data, update } = useStore();
  const n = nutritionOf(data);
  const lastWeight = [...data.bodyweight].sort((a, b) => b.date.localeCompare(a.date))[0];
  const [show, setShow] = useState(n.showCalories);
  const [t, setT] = useState({ kcal: n.targets.kcal?.toString() ?? '', protein: n.targets.protein?.toString() ?? '', carbs: n.targets.carbs?.toString() ?? '', fat: n.targets.fat?.toString() ?? '' });
  const [est, setEst] = useState(!!preset);
  const [p, setP] = useState({ sex: 'male' as 'male' | 'female', age: '', ft: '', inch: '', lb: preset ? String(preset.lb) : lastWeight?.unit === 'lb' ? String(lastWeight.value) : '', activity: '1.375', goal: (preset?.goal ?? 'maintain') as 'lose' | 'lose-slow' | 'maintain' | 'gain-slow' });
  const [note, setNote] = useState<string | null>(null);

  const runEstimate = () => {
    const age = Number(p.age), h = Number(p.ft) * 12 + Number(p.inch || 0), w = Number(p.lb);
    if (!age || !h || !w) { setNote('Fill in age, height and weight.'); return; }
    const r = estimateTargets({ sex: p.sex, age, heightIn: h, weightLb: w, activity: Number(p.activity), goal: p.goal });
    setT({ kcal: String(r.kcal), protein: String(r.protein), carbs: String(r.carbs), fat: String(r.fat) });
    setNote(`Estimated maintenance: about ${r.tdee.toLocaleString()} kcal/day.${r.floored ? ' Momentum doesn’t suggest going lower than this target.' : ''} Adjust anything you like.`);
    setEst(false);
  };
  const save = () => {
    const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s))));
    update((d) => { d.settings.nutrition = { showCalories: show, targets: { kcal: num(t.kcal), protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat) } }; return d; });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Food targets" onClick={onClose}>
      <div className="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Daily targets</h2>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <p className="text-sm text-haze">All optional. Leave blank to just track without a goal.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([['kcal', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)']] as const).map(([k, l]) => (
            <label key={k}><span className="mb-1 block text-sm text-haze">{l}</span>
              <input inputMode="numeric" type="number" min={0} className={field} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} /></label>
          ))}
        </div>
        {note && <p className="mt-2 text-sm text-tide">{note}</p>}

        {!est ? (
          <Btn variant="ghost" className="mt-3 w-full" onClick={() => setEst(true)}>Estimate targets for me</Btn>
        ) : (
          <div className="mt-4 space-y-3 rounded-2xl border border-rim p-4">
            <Chips value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            <div className="grid grid-cols-3 gap-2">
              <label><span className="mb-1 block text-sm text-haze">Age</span><input inputMode="numeric" type="number" className={field} value={p.age} onChange={(e) => setP({ ...p, age: e.target.value })} /></label>
              <label><span className="mb-1 block text-sm text-haze">Height ft</span><input inputMode="numeric" type="number" className={field} value={p.ft} onChange={(e) => setP({ ...p, ft: e.target.value })} /></label>
              <label><span className="mb-1 block text-sm text-haze">in</span><input inputMode="numeric" type="number" className={field} value={p.inch} onChange={(e) => setP({ ...p, inch: e.target.value })} /></label>
            </div>
            <label className="block"><span className="mb-1 block text-sm text-haze">Weight (lb)</span><input inputMode="decimal" type="number" className={field} value={p.lb} onChange={(e) => setP({ ...p, lb: e.target.value })} /></label>
            <label className="block"><span className="mb-1 block text-sm text-haze">Activity</span>
              <select className={field} value={p.activity} onChange={(e) => setP({ ...p, activity: e.target.value })}>
                <option value="1.2">Mostly sitting</option><option value="1.375">Light: 1–3 workouts a week</option>
                <option value="1.55">Moderate: 3–5 workouts a week</option><option value="1.725">Very active: 6–7 days a week</option>
              </select></label>
            <div><p className="mb-2 text-sm text-haze">Goal</p>
              <Chips value={p.goal} onChange={(v) => setP({ ...p, goal: v })} options={[
                { value: 'lose', label: 'Lose ~1 lb/wk' }, { value: 'lose-slow', label: 'Lose ~½ lb/wk' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain-slow', label: 'Gain slowly' }]} />
            </div>
            <Btn className="w-full" onClick={runEstimate}>Calculate</Btn>
            <p className="text-xs text-haze">Uses the Mifflin-St Jeor equation, protein around 0.7 g per lb, and 30% of calories from fat. It’s a starting point, not medical advice. Your weight trend over a few weeks is the best guide.</p>
          </div>
        )}

        <div className="mt-4 border-t border-rim pt-3">
          <Toggle label="Show calories" hint="Turn off to track meals and protein without seeing calorie totals." checked={show} onChange={setShow} />
        </div>
        <Btn size="lg" className="mt-4 w-full" onClick={save}>Save</Btn>
      </div>
    </div>
  );
}
