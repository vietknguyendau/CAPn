import { useMemo, useState } from 'react';
import { Check, ChevronLeft, Pencil, Target } from 'lucide-react';
import { useStore } from '../store';
import type { Goal as GoalT, GoalFocus } from '../types';
import { FOCUS_INFO, SPORTS, latestWeight, recommend, weightPlan, programMinutes, type PlanOption } from '../lib/goals';
import { planName } from '../lib/plan';
import { PROGRAMS } from '../data/programs';
import { DAY_NAMES, fmtLong, todayISO, uid } from '../lib/date';
import { TargetsSheet } from '../components/TargetsSheet';
import { Badge, Btn, Chips, H2, Panel, Screen, cx } from '../components/ui';

const field = 'min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun';

export default function Goal() {
  const { data, go } = useStore();
  const goal = data.settings.goal;
  const [editing, setEditing] = useState(!goal);
  return (
    <Screen title="My goal" sub={goal && !editing ? `Set ${fmtLong(goal.startDate)}` : 'Tell Momentum what you’re working toward'}
      right={<Btn variant="ghost" onClick={() => go('home')}><ChevronLeft size={18} />Back</Btn>}>
      {editing || !goal ? <GoalForm initial={goal} onDone={() => setEditing(false)} /> : <Overview goal={goal} onEdit={() => setEditing(true)} />}
    </Screen>
  );
}

function GoalForm({ initial, onDone }: { initial?: GoalT; onDone: () => void }) {
  const { data, update } = useStore();
  const lw = latestWeight(data);
  const [unit, setUnit] = useState<'lb' | 'kg'>(initial?.unit ?? data.settings.defaultUnit);
  const [start, setStart] = useState(String(initial?.startWeight ?? lw?.value ?? ''));
  const [target, setTarget] = useState(initial?.targetWeight != null ? String(initial.targetWeight) : '');
  const [focus, setFocus] = useState<GoalFocus[]>(initial?.focus ?? []);
  const [experience, setExperience] = useState<GoalT['experience']>(initial?.experience ?? 'returning');
  const [days, setDays] = useState(initial?.daysPerWeek ?? 3);
  const [minutes, setMinutes] = useState(initial?.minutes ?? 45);
  const [equipment, setEquipment] = useState<GoalT['equipment']>(initial?.equipment ?? 'gym');
  const [sports, setSports] = useState<string[]>(initial?.sports ?? []);
  const [pace, setPace] = useState<GoalT['pace']>(initial?.pace ?? 'gentle');

  const sw = Number(start), tw = target.trim() === '' ? null : Number(target);
  const ok = sw > 0 && focus.length > 0 && (tw == null || tw > 0);
  const toggleFocus = (f: GoalFocus) => setFocus((cur) => cur.includes(f) ? cur.filter((x) => x !== f) : cur.length >= 2 ? [cur[0], f] : [...cur, f]);
  const toggleSport = (s: string) => setSports((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s].slice(0, 2));
  const changing = tw != null && Math.abs(tw - sw) >= 0.5;

  const save = () => {
    update((d) => {
      const today = todayISO();
      d.settings.goal = {
        createdAt: initial?.createdAt ?? new Date().toISOString(), startDate: initial?.startDate ?? today,
        startWeight: sw, targetWeight: tw, unit, focus, experience, daysPerWeek: days, minutes, equipment, sports, pace,
      };
      d.settings.trackBodyweight = true;
      if (!d.bodyweight.some((b) => b.date === today)) d.bodyweight.push({ id: uid(), date: today, value: sw, unit });
      return d;
    });
    onDone();
  };

  const pill = (active: boolean) => cx('min-h-[44px] rounded-full border px-4 text-sm font-semibold', active ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk');
  return (
    <div className="space-y-4">
      <Panel>
        <H2>Weight</H2>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="mb-1 block text-sm text-haze">Now ({unit})</span><input inputMode="decimal" type="number" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label><span className="mb-1 block text-sm text-haze">Goal ({unit}, optional)</span><input inputMode="decimal" type="number" className={field} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Leave blank" /></label>
        </div>
        <div className="mt-2"><Chips value={unit} onChange={setUnit} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} /></div>
        {changing && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-haze">Pace</p>
            <Chips value={pace} onChange={setPace} options={tw! < sw
              ? [{ value: 'gentle', label: `Gentle · ~${unit === 'lb' ? '0.5 lb' : '0.25 kg'}/week` }, { value: 'steady', label: `Steady · ~${unit === 'lb' ? '1 lb' : '0.5 kg'}/week` }]
              : [{ value: 'gentle', label: `Lean gain · ~${unit === 'lb' ? '0.25 lb' : '0.1 kg'}/week` }, { value: 'steady', label: `Faster · ~${unit === 'lb' ? '0.5 lb' : '0.25 kg'}/week` }]} />
          </div>
        )}
      </Panel>

      <Panel>
        <H2 aside="pick 1 or 2">What are you training for?</H2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(FOCUS_INFO) as GoalFocus[]).map((f) => {
            const i = focus.indexOf(f);
            return (
              <button key={f} aria-pressed={i >= 0} onClick={() => toggleFocus(f)}
                className={cx('relative rounded-xl border p-3 text-left', i >= 0 ? 'border-sun bg-sun/10' : 'border-rim')}>
                <span className={cx('block font-display text-lg font-semibold', i >= 0 && 'text-sun')}>{FOCUS_INFO[f].label}</span>
                <span className="block text-xs text-haze">{FOCUS_INFO[f].hint}</span>
                {i >= 0 && <span className="absolute right-2 top-2"><Badge tone="sun">{i === 0 ? 'Main' : 'Also'}</Badge></span>}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <H2>Your training</H2>
        <p className="mb-2 text-sm text-haze">Experience</p>
        <Chips value={experience} onChange={setExperience} options={[{ value: 'new', label: 'New to the gym' }, { value: 'returning', label: 'Getting back into it' }, { value: 'regular', label: 'Training regularly' }]} />
        <p className="mb-2 mt-4 text-sm text-haze">Days per week</p>
        <div className="flex flex-wrap gap-2">{[2, 3, 4, 5, 6].map((n) => <button key={n} aria-pressed={days === n} onClick={() => setDays(n)} className={pill(days === n)}>{n}</button>)}</div>
        <p className="mb-2 mt-4 text-sm text-haze">Time per session</p>
        <div className="flex flex-wrap gap-2">{[20, 30, 45, 60].map((n) => <button key={n} aria-pressed={minutes === n} onClick={() => setMinutes(n)} className={pill(minutes === n)}>{n} min</button>)}</div>
        <p className="mb-2 mt-4 text-sm text-haze">Where you train</p>
        <Chips value={equipment} onChange={setEquipment} options={[{ value: 'gym', label: 'Full gym' }, { value: 'dumbbells', label: 'Home, with dumbbells' }, { value: 'none', label: 'No equipment' }]} />
        <p className="mb-2 mt-4 text-sm text-haze">Sports you play (optional, up to 2)</p>
        <div className="flex flex-wrap gap-2">{SPORTS.map((s) => <button key={s} aria-pressed={sports.includes(s)} onClick={() => toggleSport(s)} className={pill(sports.includes(s))}>{s}</button>)}</div>
      </Panel>

      <Btn size="lg" className="w-full" disabled={!ok} onClick={save}><Target size={18} />{initial ? 'Update goal & plans' : 'See my plans'}</Btn>
      {!focus.length && <p className="text-center text-sm text-haze">Pick at least one thing you’re training for.</p>}
    </div>
  );
}

function Overview({ goal, onEdit }: { goal: GoalT; onEdit: () => void }) {
  const { data, update, go } = useStore();
  const lw = latestWeight(data);
  const wp = weightPlan(goal, lw?.value ?? null);
  const options = useMemo(() => recommend(goal), [goal]);
  const [targets, setTargets] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const apply = (o: PlanOption) => {
    if (!confirm(`Use “${o.name}” as your week? It replaces your current week. You can still change any day afterward.`)) return;
    update((d) => {
      d.settings.weeklyPlan = o.days;
      d.settings.overrides = Object.fromEntries(Object.entries(d.settings.overrides).filter(([k]) => k < todayISO()));
      if (d.settings.goal) d.settings.goal.appliedPlan = o.id;
      return d;
    });
    setApplied(o.id);
  };

  return (
    <div className="space-y-4">
      <Panel tone="sun">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-sun">{goal.focus.map((f) => FOCUS_INFO[f].label).join(' + ')}</p>
            <p className="mt-1 text-sm text-haze">{goal.daysPerWeek} days · {goal.minutes} min · {goal.equipment === 'gym' ? 'full gym' : goal.equipment === 'dumbbells' ? 'home with dumbbells' : 'no equipment'}{goal.sports.length ? ` · ${goal.sports.join(', ')}` : ''}</p>
          </div>
          <Btn variant="ghost" onClick={onEdit}><Pencil size={16} />Edit</Btn>
        </div>
        {wp && (
          <div className="mt-4">
            <div className="flex items-end justify-between">
              <div><p className="text-xs text-haze">Start</p><p className="font-display text-2xl">{goal.startWeight}</p></div>
              <div className="text-center"><p className="text-xs text-haze">Now</p><p className="font-display text-4xl font-bold">{wp.now}</p></div>
              <div className="text-right"><p className="text-xs text-haze">Goal</p><p className="font-display text-2xl text-sun">{goal.targetWeight}</p></div>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-rim"><div className="h-full rounded-full bg-sun" style={{ width: `${Math.round(wp.progress * 100)}%` }} /></div>
            <p className="mt-2 text-sm">
              {wp.dir === 'done' ? 'You’ve reached your goal weight. Nice work. Consider switching to maintenance.'
                : `${Math.abs(wp.diff)} ${goal.unit} to go. At about ${wp.rate} ${goal.unit}/week, that’s roughly ${wp.weeks} weeks (around ${wp.eta ? new Date(wp.eta).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''}).`}
            </p>
            {wp.bigChange && <p className="mt-2 text-sm text-haze">That’s a big change. A first milestone around 5–10% of your starting weight is a great checkpoint, and a doctor can help you plan the rest.</p>}
          </div>
        )}
      </Panel>

      {wp && wp.dir !== 'done' && (
        <Panel>
          <H2>Food to match</H2>
          <p className="text-sm">
            {wp.dir === 'lose' ? `Eat about ${Math.abs(wp.kcalAdjust)} kcal below maintenance` : `Eat about ${wp.kcalAdjust} kcal above maintenance`}
            {' '}and aim for around <span className="text-tide">{wp.protein} g protein</span> a day to {wp.dir === 'lose' ? 'keep your muscle while you lose fat' : 'build muscle, not just weight'}.
          </p>
          <Btn variant="ghost" className="mt-3 w-full" onClick={() => setTargets(true)}>Set my food targets</Btn>
          <p className="mt-2 text-xs text-haze">Estimates, not medical advice. Your weekly weigh-in trend is the real guide.</p>
        </Panel>
      )}

      <h2 className="px-1 pt-2 font-display text-2xl font-semibold">Plans that fit</h2>
      {options.map((o) => {
        const isApplied = applied === o.id || (!applied && goal.appliedPlan === o.id);
        return (
          <Panel key={o.id} tone={o.id === 'recommended' ? 'sun' : undefined}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-2xl font-semibold leading-tight">{o.name}</h3>
              {isApplied && <Badge tone="tide">Your week</Badge>}
            </div>
            <p className="mt-1 text-sm text-haze">{o.sessions} sessions · about {Math.round(o.weeklyMinutes / 5) * 5} min a week</p>
            <p className="mt-2 text-sm">{o.why}</p>
            <ol className="mt-3 divide-y divide-rim rounded-xl border border-rim">
              {o.days.map((d, i) => {
                const prog = d.kind === 'workout' ? PROGRAMS.find((p) => p.id === (d.ref as any).id) : null;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="w-9 shrink-0 text-haze">{DAY_NAMES[i].slice(0, 3)}</span>
                    <span className={cx('min-w-0 flex-1 truncate', d.kind === 'workout' ? 'font-semibold' : d.kind === 'activity' ? 'text-tide' : 'text-haze')}>{planName(d, data)}</span>
                    {prog && <span className="shrink-0 text-xs text-haze">{programMinutes(prog)}m</span>}
                  </li>
                );
              })}
            </ol>
            {isApplied ? (
              <Btn variant="ghost" className="mt-3 w-full" onClick={() => go('home')}><Check size={16} />Applied. See your week</Btn>
            ) : (
              <Btn className="mt-3 w-full" variant={o.id === 'recommended' ? 'primary' : 'ghost'} onClick={() => apply(o)}>Use this plan</Btn>
            )}
          </Panel>
        );
      })}
      <p className="px-1 text-xs text-haze">After applying, tap any day on Home or in My week to swap workouts. The plan is a starting point, not a contract.</p>
      {targets && wp && <TargetsSheet onClose={() => setTargets(false)} preset={{ lb: goal.unit === 'lb' ? wp.now : Math.round(wp.now / 0.4536), goal: wp.dir === 'lose' ? (goal.pace === 'steady' ? 'lose' : 'lose-slow') : wp.dir === 'gain' ? 'gain-slow' : 'maintain' }} />}
    </div>
  );
}
